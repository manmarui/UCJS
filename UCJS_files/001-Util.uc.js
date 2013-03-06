// ==UserScript==
// @name Util.uc.js
// @description Common utilities.
// @include main
// @include chrome://global/content/console.xul
// ==/UserScript==

// @include chrome://browser/content/pageinfo/pageInfo.xul
// @include chrome://browser/content/bookmarks/bookmarksPanel.xul
// @include chrome://browser/content/history/history-panel.xul

// @usage Access to functions through the global scope,
// |window.ucjsUtil.XXX|

// @note Note the definitions only in the main window (e.g. gBrowser) when
// including in the other window.


var ucjsUtil = (function(window, undefined) {


"use strict";


/**
 * XPCOM handler
 */
const XPCOM = (function() {
  const kServices = {
    'BrowserGlue': {
      CID: '@mozilla.org/browser/browserglue;1',
      IID: 'nsIBrowserGlue'
    },
    'StyleSheetService': {
      CID: '@mozilla.org/content/style-sheet-service;1',
      IID: 'nsIStyleSheetService'
    },
    'TextToSubURI': {
      CID: '@mozilla.org/intl/texttosuburi;1',
      IID: 'nsITextToSubURI'
    }//,
  };

  const kInstances = {
    'DocumentEncoder': {
      CID: '@mozilla.org/layout/documentEncoder;1',
      IID: 'nsIDocumentEncoder'
    },
    'ScriptableUnicodeConverter': {
      CID: '@mozilla.org/intl/scriptableunicodeconverter',
      IID: 'nsIScriptableUnicodeConverter'
    },
    'Timer': {
      CID: '@mozilla.org/timer;1',
      IID: 'nsITimer'
    }//,
  };

  function getService(aName, aCIDParams) {
    if (window.Services.hasOwnProperty(aName)) {
      return window.Services[aName];
    }

    if (!kServices.hasOwnProperty(aName)) {
      throw Error('service is not defined: ' + aName);
    }

    if (!(kServices[aName] instanceof window.Ci.nsISupports)) {
      let service = create(kServices[aName], aCIDParams, 'getService');
      delete kServices[aName];
      kServices[aName] = service
    }
    return kServices[aName];
  }

  function getInstance(aName, aCIDParams) {
    if (!kInstances.hasOwnProperty(aName)) {
      throw Error('instance is not defined: ' + aName);
    }

    return create(kInstances[aName], aCIDParams, 'createInstance');
  }

  function getConstructor(aName, aCIDParams) {
    if (!kInstances.hasOwnProperty(aName)) {
      throw Error('instance is not defined: ' + aName);
    }

    let {CID, IID} = kInstances[aName];

    CID = fixupCID(CID, aCIDParams);

    if (Array.isArray(IID)) {
      throw Error('multiple IID is not allowed');
    }

    return window.Components.Constructor(window.Cc[CID], window.Ci[IID]);
  }

  function create(aItem, aCIDParams, aMethod) {
    let {CID, IID} = aItem;

    CID = fixupCID(CID, aCIDParams);

    if (!Array.isArray(IID)) {
      IID = [IID];
    }

    try {
      let res = window.Cc[CID][aMethod]();
      IID.forEach(function(id) {
        res.QueryInterface(window.Ci[id]);
      });
      return res;
    } catch (ex) {}
    return null;
  }

  function fixupCID(aCID, aCIDParams) {
    if (aCIDParams) {
      let params = [];
      for (let [name, value] in Iterator(aCIDParams)) {
        params.push(name + '=' + value);
      }
      aCID += '?' + params.join('&');
    }
    return aCID;
  }

  return {
    $S: getService,
    $I: getInstance,
    $C: getConstructor
  };
})();

/**
 * Timer handler
 * Alternative native timers
 * @see https://github.com/mozilla/addon-sdk/blob/master/lib/sdk/timers.js
 */
const TimerHandler = (function() {
  const {TYPE_ONE_SHOT, TYPE_REPEATING_SLACK} = window.Ci.nsITimer;

  // instance constructor
  const Timer = XPCOM.$C('Timer');

  let timers = {};
  let lastID = 0;

  function setTimer(aType, aCallback, aDelay) {
    let id = ++lastID;
    let timer = timers[id] = Timer();
    let args = Array.slice(arguments, 3);

    timer.initWithCallback({
      notify: function notify() {
        try {
          if (aType === TYPE_ONE_SHOT) {
            delete timers[id];
          }
          aCallback.apply(null, args);
        } catch (ex) {}
      }
    }, aDelay || 0, aType);

    return id;
  }

  function unsetTimer(aID) {
    let timer = timers[aID];
    delete timers[aID];
    if (timer) {
      timer.cancel();
    }
  }

  return {
    setTimeout: setTimer.bind(null, TYPE_ONE_SHOT),
    setInterval: setTimer.bind(null, TYPE_REPEATING_SLACK),
    clearTimeout: unsetTimer.bind(null),
    clearInterval: unsetTimer.bind(null)
  };
})();


//********** DOM functions

function setEventListener(aData) {
  var [target, type, listener, capture] = aData;
  if (!target || !type || !listener) {
    return;
  }

  capture = !!capture;

  target.addEventListener(type, listener, capture);
  window.addEventListener('unload', function removeEvent() {
    target.removeEventListener(type, listener, capture);
    window.removeEventListener('unload', removeEvent, false);
  }, false);
}

/**
 * Gets a selected text under the cursor
 * @param aOption {hash}
 *   @key event {MouseEvent}
 *   @key charLen {integer}
 * @return {string}
 *
 * TODO: |event.rangeOffset| sometimes returns wrong value.
 * e.g. When a cursor is below the first row in <textarea>, it returns the same
 * value that is as if at the first row.
 * WORKAROUND: rescan ranges with the client coordinates instead of the range
 * offset.
 */
function getSelectionAtCursor(aOption) {
  const kMaxCharLen = 150;
  var {event, charLen} = aOption || {};

  var node, rangeParent, rangeOffset;
  if (event) {
    // event mode
    node = event.target;
    rangeParent = event.rangeParent;
    rangeOffset = event.rangeOffset; // TODO: may be wrong
  }
  else if (window.gContextMenu) {
    // contextmenu mode
    // @see chrome://browser/content/nsContextMenu.js
    node = window.document.popupNode;
    rangeParent = window.document.popupRangeParent;
    rangeOffset = window.document.popupRangeOffset;
  }

  var selection = getSelectionController(node);
  if (!selection) {
    return null;
  }

  var text = '';

  // scan ranges with the range offset
  for (let i = 0, l = selection.rangeCount, range; i < l; i++) {
    range = selection.getRangeAt(i);
    if (range.isPointInRange(rangeParent, rangeOffset)) {
      text = getSelectedTextInRange(range);
      break;
    }
  }
  // WORKAROUND: |event.rangeOffset| may be wrong when |text| is empty at the
  // event mode. So rescan the ranges with the client coordinates.
  if (event && !text) {
    let {clientX: x, clientY: y} = event;
    let rect;
    for (let i = 0, l = selection.rangeCount, range; i < l; i++) {
      range = selection.getRangeAt(i);
      rect = range.getBoundingClientRect();
      if (rect.left <= x && x <= rect.right &&
          rect.top <= y && y <= rect.bottom) {
        text = getSelectedTextInRange(range);
        break;
      }
    }
  }

  // only use the first important chars
  text = trimText(text, Math.min(charLen || kMaxCharLen, kMaxCharLen));

  return text;
}

function getSelectionController(aNode) {
  if (!aNode) {
    return null;
  }

  // 1. scan selection in a textbox (exclude password)
  if ((aNode instanceof HTMLInputElement && aNode.mozIsTextField(true)) ||
      aNode instanceof HTMLTextAreaElement) {
    try {
      return aNode.QueryInterface(window.Ci.nsIDOMNSEditableElement).
        editor.selection;
    } catch (ex) {}
    return null;
  }
  // 2. get a window selection
  var win = aNode.ownerDocument.defaultView || getFocusedWindow();
  return win.getSelection();
}

function getSelectedTextInRange(aRange) {
  if (!aRange.toString()) {
    return '';
  }

  var type = 'text/plain';
  var encoder = XPCOM.$I('DocumentEncoder', {type: type});

  encoder.init(
    aRange.startContainer.ownerDocument,
    type,
    encoder.OutputLFLineBreak |
    encoder.SkipInvisibleContent
  );

  encoder.setRange(aRange);

  return encoder.encodeToString();
}

// @see chrome://browser/content/browser.js::getBrowserSelection()
function trimText(aText, aMaxLength) {
  if (!aText) {
    return '';
  }

  if (aText.length > aMaxLength) {
    let match = RegExp('^(?:\\s*.){0,' + aMaxLength + '}').exec(aText);
    if (!match) {
      return '';
    }
    aText = match[0];
  }

  aText = aText.trim().replace(/\s+/g, ' ');

  if (aText.length > aMaxLength) {
    aText = aText.substr(0, aMaxLength);
  }

  return aText;
}

/**
 * Creates an element with the attributes
 * @param aTagOrNode {string|Element}
 *   {string}: set a <tagname>
 *   {Element}: set a <element> only for setting the attributes
 * @param aAttribute {hash}
 *   set list of <attribute name>: <attribute value>
 *   an attribute will be ignored if the value is |null| or |undefined|
 * @return {Element}
 *
 * @note Only for XUL element.
 * TODO: Handle the namespace of a tag/attribute.
 */
function createNode(aTagOrNode, aAttribute) {
  let node = (typeof aTagOrNode === 'string') ?
    window.document.createElement(aTagOrNode) : aTagOrNode;

  if (!!aAttribute) {
    for (let [name, value] in Iterator(aAttribute)) {
      if (value !== null && value !== undefined) {
        node.setAttribute(name, value);
      }
    }
  }

  return node;
}

// @note Only for XUL element.
function getNodeByAnonid(aId, aContext) {
  return window.document.
    getAnonymousElementByAttribute(aContext, 'anonid', aId);
}

/**
 * Gets the focused window
 * @return {Window}
 *   if in the main browser window, returns a content window (top or frame)
 */
function getFocusedWindow() {
  var focusedWindow = window.document.commandDispatcher.focusedWindow;

  if (window.document.documentElement.
      getAttribute('windowtype') === 'navigator:browser') {
    if (!focusedWindow || focusedWindow === window) {
      focusedWindow = window.content;
    }
  }
  return focusedWindow || window;
}

function getFocusedDocument() {
  var win = getFocusedWindow();

  return win.contentDocument || win.document;
}

function getNodesByAttribute(aAttribute, aContext) {
  var {name, value, tag} = aAttribute;
  if (!name) {
    throw Error('attribute name is required');
  }

  var xpath = 'descendant::' + (tag || '*') +
    (value ?
    '[contains(concat(" ",@' + name + '," ")," ' + value + ' ")]' :
    '[@' + name + ']');

  return getNodesByXPath(xpath, aContext);
}

function getFirstNodeBySelector(aSelector, aContext) {
  var node = aContext || getFocusedDocument();

  return node.querySelector(aSelector);
}

function getNodesBySelector(aSelector, aContext) {
  var node = aContext || getFocusedDocument();

  // @return {static NodeList}
  return node.querySelectorAll(aSelector);
}

function getFirstNodeByXPath(aXPath, aContext) {
  var result = evaluateXPath(
    aXPath,
    aContext,
    XPathResult.FIRST_ORDERED_NODE_TYPE
  );

  return result ? result.singleNodeValue : null;
}

function getNodesByXPath(aXPath, aContext) {
  var result = evaluateXPath(
    aXPath,
    aContext,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE
  );

  var nodes = new Array(result ? result.snapshotLength : 0);

  for (let i = 0, len = nodes.length; i < len; i++) {
    nodes[i] = result.snapshotItem(i);
  }

  return nodes;
}

function evaluateXPath(aXPath, aContext, aType) {
  var doc, base;

  if (aContext instanceof Document) {
    doc  = aContext;
    base = doc.documentElement;
  } else {
    doc  = aContext ? aContext.ownerDocument : getFocusedDocument();
    base = aContext || doc.documentElement;
  }

  var resolver;

  var defaultNS = null;
  try {
    defaultNS = base.lookupNamespaceURI(null);
  } catch (ex) {}

  if (defaultNS) {
    let tmpPrefix = '__NS__';
    aXPath = fixNamespacePrefixForXPath(aXPath, tmpPrefix);
    resolver = function(prefix) {
      return (prefix === tmpPrefix) ?
        defaultNS : lookupNamespaceURI(prefix);
    };
  } else {
    resolver = function(prefix) {
      return lookupNamespaceURI(prefix);
    };
  }

  var result = null;
  try {
    result = doc.evaluate(aXPath, base, resolver, aType, null);
  } catch (ex) {}
  return result;
}

function lookupNamespaceURI(aPrefix) {
  const kNS = {
    xul:   'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul',
    html:  'http://www.w3.org/1999/xhtml',
    xhtml: 'http://www.w3.org/1999/xhtml',
    xlink: 'http://www.w3.org/1999/xlink'
  };

  return kNS[aPrefix] || null;
}

// @note cf. http://nanto.asablo.jp/blog/2008/12/11/4003371
function fixNamespacePrefixForXPath(aXPath, aPrefix) {
  /**
   * identifier  ([A-Za-z_\u00c0-\ufffd][\w\-.\u00b7-\ufffd]*|\*)
   *               \s*
   * suffix        (::?|\()?
   *             |
   * operator    (\/\/?|!=|[<>]=?|[\(\[|,=+-])
   *             |
   *             ".*?"|
   *             '.*?'|
   *             \.?\d+(?:\.\d*)?|
   *             \.\.?|
   *             [\)\]@$]
   */
  const kToken = /([A-Za-z_\u00c0-\ufffd][\w\-.\u00b7-\ufffd]*|\*)\s*(::?|\()?|(\/\/?|!=|[<>]=?|[\(\[|,=+-])|".*?"|'.*?'|\.?\d+(?:\.\d*)?|\.\.?|[\)\]@$]/g;

  var prefix = aPrefix + ':', ready = true;

  function replacer(token, identifier, suffix, operator) {
    if (suffix) {
      ready = (suffix === '::' && identifier !== 'attribute' &&
              identifier !== 'namespace') ||
              suffix === '(';
    } else if (identifier) {
      if (ready && identifier !== '*') {
        token = prefix + token;
      }
      // Consecutive identifiers are alternately ready or not.
      ready = (ready === null) ? true : null;
    } else {
      ready = !!operator;
    }

    return token;
  }

  return aXPath.replace(kToken, replacer);
}


//********** Page/Tab/Window function

function checkSecurity(aURL) {
  // @see chrome://global/content/contentAreaUtils.js::urlSecurityCheck()
  window.urlSecurityCheck(
    aURL,
    gBrowser.contentPrincipal,
    window.Ci.nsIScriptSecurityManager.DISALLOW_INHERIT_PRINCIPAL
  );
}

function unescapeURLCharacters(aURL) {
  const kURLChars = {
    "21":"!", "23":"#", "24":"$", "25":"%", "26":"&", "27":"'", "28":"(",
    "29":")",
    "2a":"*", "2b":"+", "2c":",", "2d":"-", "2e":".", "2f":"/",
    "3a":":", "3b":";", "3d":"=", "3f":"?", "40":"@", "5f":"_", "7e":"~"
  };

  if (!aURL) {
    return '';
  }

  for (let key in kURLChars) {
    aURL = aURL.replace(RegExp('%(?:25)?' + key, 'ig'), kURLChars[key]);
  }

  return aURL;
}

function unescapeURLForUI(aURL, aCharset) {
  if (!aURL) {
    return '';
  }

  var charset = aCharset || getFocusedDocument().characterSet;

  return XPCOM.$S('TextToSubURI').unEscapeURIForUI(charset, aURL);
}

function resolveURL(aURL, aBaseURL) {
  if (!aURL || !/\S/.test(aURL)) {
    return '';
  }

  if (/^[a-zA-Z]+:/.test(aURL)) {
    return aURL;
  }

  var baseURL = aBaseURL || getFocusedDocument().documentURI;

  // @see chrome://browser/content/utilityOverlay.js::makeURLAbsolute()
  return window.makeURLAbsolute(baseURL, aURL);
}

function openNewWindow(aURL, aOption) {
  var URL = resolveURL(aURL);
  if (!URL) {
    return;
  }

  aOption = aOption || {};
  var {inBackground} = aOption;

  checkSecurity(URL);

  // @see chrome://browser/content/utilityOverlay.js::openNewWindowWith()
  var newWin = window.
    openNewWindowWith(URL, getFocusedDocument(), null, false);

  if (inBackground) {
    setTimeout(window.focus, 0);
  }

  return newWin;
}

function openHomePages(aOption) {
  aOption = aOption || {};
  var {doReplace, onlyFirstPage} = aOption;

  // @see chrome://browser/content/browser.js::gHomeButton
  var homePages = window.gHomeButton.getHomePage().split('|');
  if (onlyFirstPage) {
    homePages = homePages[0];
  }

  openTabs(homePages, {ucjsReplace: doReplace, ucjsTrustURL: true});
}

function openTabs(aURLs, aOption) {
  if (typeof aURLs === 'string') {
    aURLs = aURLs.split('|');
  }
  if (!Array.isArray(aURLs) || aURLs.length === 0) {
    return;
  }

  aOption = aOption || {};
  var {inBackground} = aOption;
  var {ucjsReplace} = aOption;
  delete aOption.ucjsReplace;

  var firstTabAdded;

  if (ucjsReplace) {
    // @see chrome://browser/content/browser.js::BrowserOpenTab
    window.BrowserOpenTab();
    removeAllTabsBut(gBrowser.selectedTab);
    firstTabAdded = loadPage(aURLs.shift(), aOption);
  } else {
    if (!inBackground) {
      firstTabAdded = openTab(aURLs.shift(), aOption);
    }
  }

  aURLs.forEach(function(url) {
    openTab(url, aOption);
  });

  if (firstTabAdded) {
    gBrowser.selectedTab = firstTabAdded;
  }
}

function openURLIn(aURL, aInTab, aOption) {
  if (aInTab) {
    return openTab(aURL, aOption);
  }
  return loadPage(aURL, aOption);
}

function openTab(aURL, aOption) {
  var URL = resolveURL(aURL);
  if (!URL) {
    return;
  }

  aOption = aOption || {};
  var {inBackground} = aOption;
  var {ucjsTrustURL} = aOption;
  delete aOption.ucjsTrustURL;

  if (!ucjsTrustURL) {
    checkSecurity(URL);
  }

  aOption.inBackground = inBackground === true;

  return gBrowser.loadOneTab(URL, aOption);
}

function loadPage(aURL, aOption) {
  var URL = resolveURL(aURL);
  if (!URL) {
    return;
  }

  aOption = aOption || {};
  var {
    referrerURI, charset, postData,
    allowThirdPartyFixup, fromExternal, isUTF8
  } = aOption;
  var {ucjsTrustURL} = aOption;
  delete aOption.ucjsTrustURL;

  if (!ucjsTrustURL) {
    checkSecurity(URL);
  }

  const {Ci} = window;
  var flags = Ci.nsIWebNavigation.LOAD_FLAGS_NONE;
  if (allowThirdPartyFixup) {
    flags |= Ci.nsIWebNavigation.LOAD_FLAGS_ALLOW_THIRD_PARTY_FIXUP;
  }
  if (fromExternal) {
    flags |= Ci.nsIWebNavigation.LOAD_FLAGS_FROM_EXTERNAL;
  }
  if (isUTF8) {
    flags |= Ci.nsIWebNavigation.LOAD_FLAGS_URI_IS_UTF8;
  }

  gBrowser.loadURIWithFlags(URL, flags, referrerURI, charset, postData);

  return gBrowser.selectedTab;
}

/**
 * Alternative |gBrowser.removeTab|
 * @see chrome://browser/content/tabbrowser.xml::removeTab
 */
function removeTab(aTab, aOption) {
  aOption = aOption || {};
  var {safeBlock} = aOption;

  if (safeBlock) {
    // do not close;
    // 1.pinned tab
    // 2.only one unpinned tab
    if (aTab.pinned ||
        gBrowser.visibleTabs.length - gBrowser._numPinnedTabs <= 1) {
      return;
    }
  }

  gBrowser.removeTab(aTab);
}

/**
 * Alternative |gBrowser.removeAllTabsBut|
 * 1.does not warn against closing multiple tabs
 * 2.does not close blocked tabs
 *
 * @see chrome://browser/content/tabbrowser.xml::removeAllTabsBut
 */
function removeAllTabsBut(aTab) {
  if (aTab.pinned) {
    return;
  }

  if (!aTab.hidden && aTab !== gBrowser.selectedTab) {
    gBrowser.selectedTab = aTab;
  }

  var tabs = gBrowser.visibleTabs;

  for (let i = tabs.length - 1, tab; i >= 0; i--) {
    tab = tabs[i];
    if (tab !== aTab && !tab.pinned) {
      removeTab(tab, {safeBlock: true});
    }
  }
}


//********** Miscellaneous function

function convertFromUTF16(aStr, aCharset) {
  if (!aCharset) {
    return null;
  }

  var converter = XPCOM.$I('ScriptableUnicodeConverter');

  converter.charset = aCharset;

  try {
    return converter.ConvertFromUnicode(aStr);
  } catch (ex) {}
  return aStr;
}

function convertToUTF16(aStr, aCharset) {
  var converter = XPCOM.$I('ScriptableUnicodeConverter');

  converter.charset = aCharset || 'UTF-8';

  try {
    return converter.ConvertToUnicode(aStr);
  } catch (ex) {}
  return aStr;
}

/**
 * Converts UTF-8 characters that are emmbeded in a user script into UTF-16 so
 * that they can be displayed properly for UI
 * @param aData {string|hash}
 * @return {}
 *
 * @note If |aData| is hash, it allows the nested array or hash but the end
 * value should be a string.
 */
function toStringForUI(aData) {
  if (!aData) {
    return aData;
  }

  if (typeof aData === 'string') {
    return convertToUTF16(aData, 'UTF-8');
  }

  if (Array.isArray(aData)) {
    return aData.map(function(value) toStringForUI(value));
  }

  if (/^{.+}$/.test(JSON.stringify(aData))) {
    for (let key in aData) {
      aData[key] = toStringForUI(aData[key]);
    }
    return aData;
  }

  return aData;
}

function getWindowList(aType) {
  if (aType !== null) {
    aType = aType || 'navigator:browser';
  }

  return XPCOM.$S('wm').getEnumerator(aType);
}

function focusWindow(aWindow) {
  var wins = getWindowList(null), win;

  while (wins.hasMoreElements()) {
    win = wins.getNext();
    if (win === aWindow) {
      win.focus();
      return;
    }
  }
}

function focusWindowAtIndex(aIdx) {
  var wins = getWindowList(null), win;
  var idx = 0;

  while (wins.hasMoreElements()) {
    win = wins.getNext();
    if (idx++ === aIdx) {
      win.focus();
      return;
    }
  }
}

function setGlobalStyleSheet(aCSS, aType) {
  return registerGlobalStyleSheet(aCSS, aType);
}

function removeGlobalStyleSheet(aCSS, aType) {
  return registerGlobalStyleSheet(aCSS, aType, {remove: true});
}

function registerGlobalStyleSheet(aCSS, aType, aOption) {
  let {remove} = aOption || {};

  let css = normalizeCSS(aCSS);
  if (!css) {
    return;
  }

  let URI;
  try {
    URI = XPCOM.$S('io').
      newURI('data:text/css,' + encodeURIComponent(css), null, null);
  } catch (ex) {
    return;
  }

  const styleSheetService = XPCOM.$S('StyleSheetService');

  let type;
  switch (aType) {
    case 'AGENT_SHEET':
    case 'USER_SHEET':
    case 'AUTHOR_SHEET':
      type = styleSheetService[aType];
      break;
    default:
      return;
  }

  let registered = styleSheetService.sheetRegistered(URI, type);

  if (!remove && !registered) {
    styleSheetService.loadAndRegisterSheet(URI, type);
  }
  else if (remove && registered) {
    styleSheetService.unregisterSheet(URI, type);
  }
}

function registerChromeStyleSheet(aCSS) {
  let css = normalizeCSS(aCSS);
  if (!css) {
    return;
  }

  let dataURI = 'data:text/css,' + encodeURIComponent(css);

  let styleSheets = window.document.styleSheets;
  let exists = Array.some(styleSheets, function(styleSheet) {
    return styleSheet.href === dataURI;
  });
  if (exists) {
    return;
  }

  let newStyleSheet = window.document.createProcessingInstruction(
    'xml-stylesheet',
    'type="text/css" href="%dataURI%"'.replace('%dataURI%', dataURI)
  );

  return window.document.
    insertBefore(newStyleSheet, window.document.documentElement);
}

function registerContentStyleSheet(aCSS, aOption) {
  let {document, id} = aOption || {};

  let css = normalizeCSS(aCSS);
  if (!css) {
    return;
  }

  let doc = document || getFocusedDocument();
  if (!doc.head) {
    return;
  }

  if (id) {
    let old = doc.getElementById(id);
    if (old) {
      if (old.textContent === css) {
        return;
      }
      old.parentNode.removeChild(old);
    }
  }

  let style = doc.createElement('style');
  style.type = 'text/css';
  if (id) {
    style.id = id;
  }
  style.textContent = css;

  return doc.head.appendChild(style);
}

function normalizeCSS(aCSS) {
  return aCSS.
    // remove consecutive white spaces
    // @note the delimiter of shorthand properties should be a SINGLE white
    // space (margin:1px 2px;)
    replace(/\s{2,}/g, '').trim().
    // remove comment
    replace(/\s*\/\*.*?\*\/\s*/g, '');
}

function getPref(aKey, aDef) {
  const prefBranch = XPCOM.$S('prefs');

  try {
    switch (prefBranch.getPrefType(aKey)) {
      case prefBranch.PREF_BOOL:
        return prefBranch.getBoolPref(aKey);
      case prefBranch.PREF_INT:
        return prefBranch.getIntPref(aKey);
      case prefBranch.PREF_STRING:
        return prefBranch.getCharPref(aKey);
    }
  } catch (ex) {}
  return aDef || null;
}

function setPref(aKey, aVal) {
  const prefBranch = XPCOM.$S('prefs');

  try {
    if (aVal === null) {
      prefBranch.clearUserPref(aKey);
      return;
    }

    if (getPref(aKey) !== aVal) {
      switch (typeof aVal) {
        case 'boolean':
          prefBranch.setBoolPref(aKey, aVal);
          break;
        case 'number':
          prefBranch.setIntPref(aKey, aVal);
          break;
        case 'string':
          prefBranch.setCharPref(aKey, aVal);
          break;
      };
    }
  } catch (ex) {}
}

/**
 * Query the Places database
 * @param aSQLInfo {hash}
 *   expression: {string} a SQL expression
 *   params: {hash} the binding parameters
 *   columns: {array} the column names
 * @return {hash[]|null}
 *   hash[]: array of {column name: value, ...}
 *   null: no result
 *
 * TODO: create an async version
 */
function scanPlacesDB(aSQLInfo) {
  const {expression, params, columns} = aSQLInfo || {};

  // @see resource:///modules/PlacesUtils.jsm
  const {PlacesUtils, Ci} = window;
  let statement =
    PlacesUtils.history.
    QueryInterface(Ci.nsPIPlacesDatabase).
    DBConnection.
    createStatement(expression);

  let rows = [];
  try {
    for (let key in statement.params) {
      if (!(key in params)) {
        throw Error('parameter is not defined: ' + key);
      }
      statement.params[key] = params[key];
    }

    while (statement.executeStep()) {
      let res = {};
      columns.forEach(function(name) {
        res[name] = statement.row[name];
      });
      rows.push(res);
    }
  } finally {
    statement.finalize();
  }

  if (rows.length) {
    return rows;
  }
  return null;
}


//********** Log function

function logMessage(aTarget, aMessage) {
  function U(value) {
    return toStringForUI(value);
  }

  if (Array.isArray(aMessage)) {
    aMessage = aMessage.join('\n');
  }

  const kMessageFormat = '[%target%]\n%message%';
  let formatMessage = U(kMessageFormat.
    replace('%target%', aTarget).
    replace('%message%', aMessage));
  let formatDate = U(getFormatDate());

  // for the error console
  XPCOM.$S('console').logStringMessage(
    [formatDate, formatMessage].join('\n'));

  // for the web console
  var win = XPCOM.$S('BrowserGlue').getMostRecentBrowserWindow();
  if (win) {
    win.content.console.log(formatMessage);
  }

  return formatMessage;
}

function getFormatDate(aOption) {
  const kStandardFormat = '%04Y/%02M/%02D %02h:%02m:%02s.%03ms';

  let {format, time} = aOption || {};
  format = format || kStandardFormat;

  let date = time ? new Date(time) : new Date();
  let map = {
    'Y': date.getFullYear(),
    'M': date.getMonth() + 1,
    'D': date.getDate(),
    'h': date.getHours(),
    'm': date.getMinutes(),
    's': date.getSeconds(),
    'ms': date.getMilliseconds()
  };

  return format.replace(/%(0)?(\d+)?(ms|[YMDhms])/g,
    function(match, pad, width, type) {
      let value = String(map[type]);
      width = width && parseInt(width);
      if (0 < width && value.length !== width) {
        if (value.length < width) {
          value = Array(width).join(!!pad ? '0' : ' ') + value;
        }
        return value.substr(-width);
      }
      return value;
    }
  );
}

function log(aMessage) {
  return logMessage('Util.uc.js', aMessage);
}


//********** Export

return {
  TimerHandler: TimerHandler,

  setEventListener: setEventListener,
  getSelectionAtCursor: getSelectionAtCursor,
  getFocusedWindow: getFocusedWindow,
  getFocusedDocument: getFocusedDocument,
  createNode: createNode,
  getNodeByAnonid: getNodeByAnonid,
  getNodesByAttribute: getNodesByAttribute,
  getFirstNodeBySelector: getFirstNodeBySelector,
  getNodesBySelector: getNodesBySelector,
  getFirstNodeByXPath: getFirstNodeByXPath,
  getNodesByXPath: getNodesByXPath,

  unescapeURLCharacters: unescapeURLCharacters,
  unescapeURLForUI: unescapeURLForUI,
  resolveURL: resolveURL,
  openWindow: openNewWindow,
  openHomePages: openHomePages,
  openTabs: openTabs,
  openURLIn: openURLIn,
  openTab: openTab,
  loadPage: loadPage,
  removeTab: removeTab,
  removeAllTabsBut: removeAllTabsBut,

  toStringForUI: toStringForUI,
  focusWindow: focusWindow,
  focusWindowAtIndex: focusWindowAtIndex,
  setGlobalStyleSheet: setGlobalStyleSheet,
  removeGlobalStyleSheet: removeGlobalStyleSheet,
  setChromeStyleSheet: registerChromeStyleSheet,
  setContentStyleSheet: registerContentStyleSheet,
  getPref: getPref,
  setPref: setPref,
  scanPlacesDB: scanPlacesDB,

  logMessage: logMessage
}


})(this);
