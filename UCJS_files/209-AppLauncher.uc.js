// ==UserScript==
// @name        AppLauncher.uc.js
// @description Application launcher
// @include     main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @usage Access to items in the main context menu.

// @note A resource file that is passed to the application will be saved in
// your temporary folder. See |doAction()|, |Util::getSavePath()|


/**
 * Main function
 * @param Util {hash} utility functions
 * @param window {hash} the global |Window| object
 * @param undefined {undefined} the |undefined| constant
 */
(function(Util, window, undefined) {


"use strict";


/**
 * Application list
 */
const kAppList = [
  {
    // Displayed name
    name: 'IE',

    // @see keys in kTypeAction
    type: 'browse',

    // Alias of the special folder is available
    // @see kSpecialFolderAliases
    // %ProgF%: program files folder
    // %LocalAppData%: local application data folder
    path: '%ProgF%\\Internet Explorer\\iexplore.exe',

    // [optional] Commandline arguments
    // %URL% is replaced with the proper URL of each action.
    // If omitted or empty, it equals to <args: '%URL%'>.
    // If launched as tool, arguments that have %URL% are removed.
    args: ['-new', '%URL%'],

    // [optional] This item is disabled
    disabled: true
  },
  {
    name: 'WMP',
    // If <type> is 'file', and also set <extensions> to describe the file
    // extensions of a link URL that is passed to the application.
    type: 'file',
    extensions: ['asx', 'wax', 'wvx'],
    path: '%ProgF%\\Windows Media Player\\wmplayer.exe',
    args: ['/prefetch:1', '%URL%']
  },
  {
    name: 'Foxit',
    type: 'file',
    extensions: ['pdf'],
    path: 'C:\\PF\\FoxitReader\\Foxit Reader.exe'
  },
  {
    name: 'Opera',
    type: 'browse',
    path: '%ProgF%\\Opera\\opera.exe'
  },
  {
    name: 'Chrome',
    type: 'browse',
    path: '%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe'
  },
  {
    name: 'unDonut',
    type: 'browse',
    path: 'C:\\PF\\unDonut\\unDonut.exe'
  },
  {
    name: 'TB',
    type: 'mail',
    path: '%ProgF%\\Mozilla Thunderbird\\thunderbird.exe'
  },
  {
    name: 'TB',
    type: 'news',
    path: '%ProgF%\\Mozilla Thunderbird\\thunderbird.exe',
    args: ['-news', '%URL%']
  },
  {
    name: 'MassiGra',
    type: 'image',
    path: 'C:\\PF\\MassiGra\\MassiGra.exe'
  },
  {
    name: 'MPC',
    type: 'media',
    path: 'C:\\PF\\MPC-HC\\mpc-hc.exe'
  },
  {
    name: 'Irvine',
    type: 'download',
    path: 'C:\\PF\\Irvine\\irvine.exe'
  },
  {
    name: '',
    type: 'ftp',
    path: ''
  },
  {
    name: 'VxEditor',
    type: 'text',
    path: 'C:\\PF\\VxEditor\\VxEditor.exe'
  },
  {
    name: 'KeePass2',
    type: 'tool',
    path: 'C:\\PF\\KeePass2\\KeePass2.exe'
  }
];

/**
 * Actions for each types
 */
const kTypeAction = {
  tool:     ['launchTool'],
  file:     ['openFile'],
  browse:   ['openPage', 'openFrame', 'openLink'],
  text:     ['viewPageSource', 'viewFrameSource', 'viewLinkSource'],
  mail:     ['sendMail'],
  news:     ['readNews'],
  media:    ['openLinkMedia', 'openMedia'],
  image:    ['viewLinkImage', 'viewImage', 'viewBGImage'],
  download: ['downloadLink', 'downloadMedia', 'downloadImage',
             'downloadBGImage'],
  ftp:      ['openFTP']
};

/**
 * String bundle
 */
const kString = {
  appMenuItem: '%type%: %name%',

  type: {
    tool:     'Tool',
    file:     'File(%1)',
    browse:   'Browser',
    text:     'Text Editor',
    mail:     'Mail Client',
    news:     'News Client',
    media:    'Media Player',
    image:    'Image Viewer',
    download: 'Downloader',
    ftp:      'FTP Client'
  },

  action: {
    launchTool:      'Launch %1',
    openFile:        'Open File in %1',
    openPage:        'Open Page in %1',
    openFrame:       'Open Frame in %1',
    openLink:        'Open Link in %1',
    viewPageSource:  'View Page Source in %1',
    viewFrameSource: 'View Frame Source in %1',
    viewLinkSource:  'View Link Source in %1',
    sendMail:        'Send Email in %1',
    readNews:        'Read News in %1',
    openLinkMedia:   'Open Linked Media in %1',
    viewLinkImage:   'View Linked Image in %1',
    openMedia:       'Open Media in %1',
    viewImage:       'View Image in %1',
    viewBGImage:     'View BG-Image in %1',
    downloadLink:    'Download Link with %1',
    downloadMedia:   'Download Media with %1',
    downloadImage:   'Download Image with %1',
    downloadBGImage: 'Download BG-Image with %1',
    openFTP:         'Open FTP in %1',
    noActions:       'No actions'
  }
};

/**
 * File extensions for the action on a link
 */
const kLinkExtension = {
  // for <openFile>
  // @note Stay empty. This is created with |FileUtil::updateFileExt()|.
  file:  [],
  // for <viewLinkSource>
  text:  ['css', 'js', 'txt', 'xml'],
  // for <viewLinkImage>
  image: ['bmp', 'gif', 'jpg', 'png'],
  // for <openLinkMedia>
  media: ['asf', 'asx', 'avi', 'flv', 'mid', 'mov', 'mp3', 'mp4', 'mpg','ogg',
          'ogv', 'pls', 'ra', 'ram', 'rm', 'wav', 'wax', 'webm', 'wma', 'wmv',
          'wvx']
};

/**
 * UI
 */
const kUI = {
  mainMenuLabel: 'AppLauncher',
  mainMenuAccesskey: 'L',
  appMenuLabel: 'Applications'
};

/**
 * Identifier
 */
const kID = {
  mainMenu: 'ucjs_applauncher_menu',
  actionKey: 'ucjs_applauncher_action',
  startSeparator: 'ucjs_applauncher_startsep',
  endSeparator: 'ucjs_applauncher_endsep'
};

/**
 * Utility for the file extensions
 */
var FileUtil = {
  makeFileAction: function(aAction, aExt) {
    return aAction + '_' + aExt;
  },

  getBaseAction: function(aAction) {
    return aAction.replace(/_.+$/, '');
  },

  updateFileExt: function(aExtArray) {
    let fileExts = kLinkExtension['file'].concat(aExtArray);

    kLinkExtension['file'] =
    fileExts.filter(function(element, index, array) {
      return array.indexOf(element) === index;
    });
  },

  matchExt: function(aURL, aType) {
    if (!aURL) {
      return null;
    }

    let ext;
    try {
      // @see chrome://global/content/contentAreaUtils.js::
      // makeURI
      let URI = window.makeURI(aURL, null, null);
      if (URI) {
        ext = URI.QueryInterface(window.Ci.nsIURL).fileExtension;
      }
    } catch (ex) {}

    if (ext && kLinkExtension[aType].indexOf(ext) > -1) {
      return ext;
    }
    return null;
  }
};


//********** Functions

function AppLauncher_init() {
  var appInfo = initAppInfo();

  if (appInfo) {
    makeMainMenu(appInfo);
  }
}

function initAppInfo() {
  let apps =
  kAppList.filter(function(app) {
    let {name, type, extensions, path, disabled} = app;

    if (!disabled && name) {
      if (type in kTypeAction) {
        if (type !== 'file' || (extensions && extensions.length)) {
          let check = checkPath(path);
          if (check && type === 'file') {
            FileUtil.updateFileExt(extensions);
          }
          return check;
        }
      }
    }
    return false;
  });

  var order = [i for (i in kTypeAction)];
  apps.sort(function(a, b) {
    return order.indexOf(a.type) - order.indexOf(b.type) ||
           a.name.localeCompare(b.name);
  });

  return apps.length ? apps : null;
}

function makeMainMenu(aAppInfo) {
  var menu = $E('menu', {
    id: kID.mainMenu,
    label: U(kUI.mainMenuLabel),
    accesskey: kUI.mainMenuAccesskey
  });

  var popup = $E('menupopup');
  addEvent([popup, 'popupshowing', doBrowse, false]);

  makeAppMenu(popup, aAppInfo);
  makeActionItems(popup, aAppInfo);

  menu.appendChild(popup);

  // @note ucjsUI_manageContextMenuSeparators() manages the visibility of
  // separators.
  var context = getContextMenu();
  addSeparator(context, kID.startSeparator);
  context.appendChild(menu);
  addSeparator(context, kID.endSeparator);
}

function makeAppMenu(aPopup, aAppInfo) {
  var menu = $E('menu', {
    label: U(kUI.appMenuLabel)
  });

  var popup = $E('menupopup');

  aAppInfo.forEach(function(app) {
    addMenuItem(popup, 'launchTool', app, true);
  });

  menu.appendChild(popup);
  aPopup.appendChild(menu);
}

function makeActionItems(aPopup, aAppInfo) {
  var type, lastType = '';
  var actions;

  aAppInfo.forEach(function(app) {
    type = app.type;

    if (type !== lastType) {
      addSeparator(aPopup);
      lastType = type;
    }

    actions = kTypeAction[type];

    if (type === 'file') {
      actions = actions.reduce(function(a, b) {
        return a.concat(app.extensions.map(function(ext) {
          return FileUtil.makeFileAction(b, ext);
        }));
      }, []);
    }

    actions.forEach(function(action) {
      addMenuItem(aPopup, action, app);
    });
  });

  addSeparator(aPopup);
  addMenuItem(aPopup, 'noActions');
}

function addMenuItem(aPopup, aAction, aApp, aInAppMenu) {
  var label;
  if (aInAppMenu) {
    let type = kString.type[aApp.type];
    if (aApp.type === 'file') {
      type = type.replace('%1', aApp.extensions.join(','));
    }
    label = kString.appMenuItem.
      replace('%type%', type).replace('%name%', aApp.name);
  } else {
    label = kString.action[FileUtil.getBaseAction(aAction)];
    if (aApp) {
      label = label.replace('%1', aApp.name);
    }
  }

  var item = $E('menuitem', {
    label: U(label),
    user: [kID.actionKey, aAction]
  });

  if (aApp) {
    addEvent([item, 'command', function() {
      doAction(aApp, aAction);
    }, false]);
  } else {
    $E(item, {disabled: true});
  }

  aPopup.appendChild(item);
}

function doBrowse(aEvent) {
  // XPath for the useless menu-separator
  // 1.it is the first visible item in the menu
  // 2.it is the last visible item in the menu
  // 3.the next visible item is a menu-separator
  const uselessSeparator = 'xul:menuseparator[not(preceding-sibling::*[not(@hidden)]) or not(following-sibling::*[not(@hidden)]) or local-name(following-sibling::*[not(@hidden)])="menuseparator"]';

  function availableItem(actions) {
    var actionKey = '@' + kID.actionKey + '="';
    return 'xul:menuitem[' +
      actionKey + actions.join('" or ' + actionKey) + '"]';
  }

  aEvent.stopPropagation();
  var popup = aEvent.target;
  if (popup.parentElement.id !== kID.mainMenu) {
    return;
  }

  // Hide all menu items and show the others
  Array.forEach(popup.childNodes, function(node) {
    var hidden = node.localName === 'menuitem';
    if (node.hidden !== hidden) {
      node.hidden = hidden;
    }
  });

  // Show the menu items with available actions
  $X(availableItem(getAvailableActions()), popup).
  forEach(function(node) {
    node.hidden = false;
  });

  // Hide the useless separators
  $X(uselessSeparator, popup).
  forEach(function(node) {
    node.hidden = true;
  });
}

function getAvailableActions() {
  // @see chrome://browser/content/nsContextMenu.js
  const {gContextMenu} = window;

  var actions = [];

  var onMedia = false;
  if (gContextMenu.onImage ||
      gContextMenu.onCanvas ||
      isImageDocument(gContextMenu.target.ownerDocument)) {
    onMedia = true;

    actions.push('viewImage');
    if (/^(?:https?|ftp):/.test(gContextMenu.imageURL)) {
      actions.push('downloadImage');
    }
  } else if (gContextMenu.onVideo || gContextMenu.onAudio) {
    onMedia = true;

    actions.push('openMedia');
    actions.push('downloadMedia');
  }

  if (gContextMenu.onLink) {
    let URL = gContextMenu.linkURL;

    let ext = FileUtil.matchExt(URL, 'file');
    if (ext) {
      actions.push(FileUtil.makeFileAction('openFile', ext));
    }

    if (FileUtil.matchExt(URL, 'text')) {
      actions.push('viewLinkSource');
    } else if (FileUtil.matchExt(URL, 'image')) {
      actions.push('viewLinkImage');
    } else if (FileUtil.matchExt(URL, 'media')) {
      actions.push('openLinkMedia');
    }

    if (/^https?:/.test(URL)) {
      actions.push('openLink');
      actions.push('downloadLink');
    } else if (/^ftp:/.test(URL)) {
      actions.push('openFTP');
    } else if (/^mailto:/.test(URL)) {
      actions.push('sendMail');
    } else if (/^s?news:/.test(URL)) {
      actions.push('readNews');
    }
  } else if (!onMedia && !gContextMenu.onTextInput) {
    let inText = isTextDocument(gContextMenu.target.ownerDocument);

    actions.push('openPage');
    if (inText) {
      actions.push('viewPageSource');
    }

    if (gContextMenu.inFrame) {
      actions.push('openFrame');
      if (inText) {
        actions.push('viewFrameSource');
      }
    }

    if (gContextMenu.hasBGImage) {
      actions.push('viewBGImage');
      actions.push('downloadBGImage');
    }
  }

  actions.push('launchTool');

  if (actions.length === 1) {
    actions.push('noActions');
  }

  return actions;
}

function doAction(aApp, aAction) {
  // @see chrome://browser/content/nsContextMenu.js
  const {gContextMenu} = window;

  var URL = '';
  var save = false;
  var sourceWindow = gContextMenu.target.ownerDocument.defaultView;

  switch (FileUtil.getBaseAction(aAction)) {
    case 'launchTool':
      break;
    case 'openPage':
      URL = window.content.location.href;
      break;
    case 'viewPageSource':
      URL = window.content.location.href;
      save = true;
      break;
    case 'openFrame':
      URL = sourceWindow.location.href;
      break;
    case 'viewFrameSource':
      URL = sourceWindow.location.href;
      save = true;
      break;
    case 'openLink':
    case 'sendMail':
    case 'readNews':
    case 'downloadLink':
    case 'openFTP':
      URL = gContextMenu.linkURL;
      break;
    case 'openFile':
    case 'viewLinkSource':
    case 'openLinkMedia':
    case 'viewLinkImage':
      URL = gContextMenu.linkURL;
      save = true;
      break;
    case 'openMedia':
      URL = gContextMenu.mediaURL;
      save = true;
      break;
    case 'viewImage':
      if (gContextMenu.onImage) {
        URL = gContextMenu.imageURL;
      } else if (gContextMenu.onCanvas) {
        URL = gContextMenu.target.toDataURL();
      } else {
        URL = sourceWindow.location.href;
      }
      save = true;
      break;
    case 'viewBGImage':
      URL = gContextMenu.bgImageURL;
      save = true;
      break;
    case 'downloadMedia':
      URL = gContextMenu.mediaURL;
      break;
    case 'downloadImage':
      URL = gContextMenu.imageURL;
      break;
    case 'downloadBGImage':
      URL = gContextMenu.bgImageURL;
      break;
  }

  runApp(aApp, URL, save ? sourceWindow : null);
}


//********** Utilities

function isImageDocument(aDocument) {
  return aDocument instanceof ImageDocument;
}

function isTextDocument(aDocument) {
  // @see chrome://browser/content/browser.js::
  // mimeTypeIsTextBased
  return window.mimeTypeIsTextBased(aDocument.contentType);
}

function addSeparator(aPopup, aID) {
  return aPopup.appendChild($E('menuseparator', {id: aID}));
}

function $E(aTagOrNode, aAttribute) {
  let node = (typeof aTagOrNode === 'string') ?
    window.document.createElement(aTagOrNode) : aTagOrNode;

  if (!!aAttribute) {
    for (let [name, value] in Iterator(aAttribute)) {
      if (name === 'user') {
        [name, value] = value;
      }
      if (value !== null && value !== undefined) {
        node.setAttribute(name, value);
      }
    }
  }

  return node;
}


/**
 * Import from |Util| parameter
 */

function checkPath(aPath) {
  return Util.isExecutable(aPath);
}

function runApp(aApp, aURL, aSourceWindow) {
  Util.runApp(aApp, aURL, aSourceWindow);
}

function getContextMenu() {
  return Util.getContextMenu();
}

function U(aStr) {
  return Util.toStringForUI(aStr);
}

function addEvent(aData) {
  Util.addEvent(aData);
}

function $X(aXPath, aNode) {
  return Util.getNodesByXPath(aXPath, aNode);
}

function log(aMsg) {
  return Util.log(aMsg);
}


//********** Entry Point

AppLauncher_init();


})


/**
 * Argument of the main function
 * @return Util {hash} utility functions
 */
((function(window, undefined) {


"use strict";


/**
 * Aliases for local special folders
 * @see http://mxr.mozilla.org/mozilla-central/source/xpcom/io/nsDirectoryServiceDefs.h
 */
const kSpecialFolderAliases = [
  // Windows "Program files" folder
  // C:/Program Files/
  '%ProgF%',

  // Windows "Local application data" folder
  // C:/Documents and Settings/{username}/Local Settings/Application Data/
  // C:/Users/{username}/AppData/Local/
  '%LocalAppData%'
];


//********** XPCOM handler

const {Cc, Ci} = window;
function $S(aCID, aIID) Cc[aCID].getService(Ci[aIID]);
function $I(aCID, aIID) Cc[aCID].createInstance(Ci[aIID]);

/**
 * Services
 */
const DirectoryService =
  $S('@mozilla.org/file/directory_service;1', 'nsIProperties');
const IOService =
  $S('@mozilla.org/network/io-service;1', 'nsIIOService');
const PromptService =
  $S('@mozilla.org/embedcomp/prompt-service;1', 'nsIPromptService');

/**
 * Instances
 */
function LocalFile()
  $I('@mozilla.org/file/local;1', 'nsIFile');
function Process()
  $I('@mozilla.org/process/util;1', 'nsIProcess');
function WebBrowserPersist()
  $I('@mozilla.org/embedding/browser/nsWebBrowserPersist;1',
    'nsIWebBrowserPersist');


//********** Functions

function runApp(aApp, aURL, aSourceWindow) {
  if (aSourceWindow) {
    saveAndExecute(aApp, aURL, aSourceWindow);
  } else {
    execute(aApp, aURL);
  }
}

function getExecutable(aPath) {
  if (!aPath) {
    return null;
  }

  kSpecialFolderAliases.forEach(function(alias) {
    if (aPath.indexOf(alias) > -1) {
      aPath = aPath.replace(
        RegExp(alias, 'g'),
        getSpecialDirectory(alias.replace(/%/g, '')).
        path.replace(/\\/g, '\\\\')
      );
    }
  });

  try {
    // @note |toStringForUI| converts 2bytes characters of |kAppList::path|
    // into unicode ones for system internal using
    aPath = toStringForUI(aPath);
    let file = makeFile(aPath);
    if (file && file.exists() && file.isFile() && file.isExecutable())
      return file;
  } catch (ex) {}
  return null;
}

function isExecutable(aPath) {
  return !!getExecutable(aPath);
}

function execute(aApp, aURL) {
  var exe = getExecutable(aApp.path);
  if (!exe) {
    warn('Not executed', ['The application is not available now', aApp.path]);
    return;
  }

  // @note |toStringForUI| converts 2bytes characters of |kAppList::args|
  // into unicode ones for system internal using
  var args = getAppArgs(toStringForUI(aApp.args), aURL);
  var process = Process();
  process.init(exe);
  // @note Use 'wide string' version for Unicode arguments.
  process.runwAsync(args, args.length);
}

function saveAndExecute(aApp, aURL, aSourceWindow) {
  try {
    var savePath = getSavePath(aURL);
    var sourceURI = makeURI(aURL);
    var targetFile = makeFile(savePath);
  } catch (ex) {
    warn('Not downloaded', [ex.message, aURL]);
    return;
  }

  var privacyContext = getPrivacyContextFor(aSourceWindow);

  var persist = WebBrowserPersist();

  persist.persistFlags =
    Ci.nsIWebBrowserPersist.PERSIST_FLAGS_CLEANUP_ON_FAILURE |
    Ci.nsIWebBrowserPersist.PERSIST_FLAGS_AUTODETECT_APPLY_CONVERSION;

  persist.progressListener = {
    onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) {
      if (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
        if (/^(?:https?|ftp):/.test(aRequest.name)) {
          let httpChannel, requestSucceeded, responseStatus;
          try {
            httpChannel = aRequest.QueryInterface(Ci.nsIHttpChannel);
            requestSucceeded = httpChannel.requestSucceeded;
            responseStatus = httpChannel.responseStatus;
          } catch (ex) {
            // @throws NS_ERROR_NOT_AVAILABLE;
            // |requestSucceeded| throws when an invalid URL is requested.
          }

          if (!requestSucceeded) {
            warn('Not downloaded',
              ['HTTP status ' + responseStatus, aRequest.name]);
            return;
          }
        }

        if (!targetFile || !targetFile.exists()) {
          warn('Not downloaded', ['Something wrong', aRequest.name]);
          return;
        }

        execute(aApp, savePath);
      }
    },

    onProgressChange: function() {},
    onLocationChange: function() {},
    onStatusChange: function() {},
    onSecurityChange: function() {}
  };

  persist.saveURI(sourceURI, null, null, null, null, targetFile,
    privacyContext);
}

function getSavePath(aURL) {
  const kFileNameForm = 'ucjsAL%NUM%_%FILENAME%';

  let fileName = makeFileName(aURL);
  if (!fileName) {
    throw new Error('Unexpected URL for download');
  }

  fileName = kFileNameForm.replace('%FILENAME%', fileName);

  let dir = getSpecialDirectory('TmpD');
  // @see chrome://global/content/contentAreaUtils.js::
  // validateFileName()
  dir.append(window.validateFileName(fileName.replace('%NUM%', '')));

  let uniqueNum = 0;
  while (dir.exists()) {
    dir.leafName = fileName.replace('%NUM%', ++uniqueNum);
  }

  return dir.path;
}

function makeFileName(aURL) {
  const kMaxBaseNameNums = 32;
  const kDefaultBaseName = 'TMP';

  let fileName, extension;
  if (/^(?:https?|ftp):/.test(aURL)) {
    let parts = aURL.replace(/^\w+:\/\/(?:www\.)?|[?#].*$/g, '').split('/');
    let host = parts.shift();
    let leaf
    while (!leaf && parts.length) {
      leaf = parts.pop();
    }
    if (leaf) {
      let lastDot = leaf.lastIndexOf('.');
      if (lastDot < 0) {
        fileName = leaf;
      } else {
        fileName = leaf.slice(0, lastDot);
        extension = leaf.slice(lastDot + 1);
      }
    } else {
      fileName = host;
      extension = 'htm';
    }
  }
  else if (aURL.startsWith('data:image/')) {
    let match = /\/([a-z]+);/.exec(aURL);
    if (match) {
      fileName = 'data_image';
      extension = match[1];
    }
  }

  if (fileName) {
    fileName = fileName.substr(0, kMaxBaseNameNums).
      replace(/^[._]+|[._]+$/g, '') || kDefaultBaseName;
    if (extension) {
      fileName += '.' + extension;
    }
    return fileName;
  }
  return null;
}

function getAppArgs(aArgs, aURL) {
  if (!aArgs) {
    return aURL ? [aURL] : [];
  }

  return aArgs.map(function(arg) {
    if (aURL) {
      return arg.replace(/%URL%/g, aURL);
    }
    // remove argument that has %URL% when the application is launched as tool
    if (arg.indexOf('%URL%') > -1) {
      return undefined;
    }
    return arg;
  }).filter(function(arg) {
    return arg !== undefined;
  });
}

function getSpecialDirectory(aAlias) {
  return DirectoryService.get(aAlias, Ci.nsIFile);
}

function makeURI(aURL, aDocument) {
  let characterSet = aDocument ? aDocument.characterSet : null;
  return IOService.newURI(aURL, characterSet, null);
}

function makeFile(aFilePath) {
  let file = LocalFile();
  file.initWithPath(aFilePath);
  return file;
}

function getPrivacyContextFor(aDocument) {
  try {
    return aDocument.defaultView.
      QueryInterface(Ci.nsIInterfaceRequestor).
      getInterface(Ci.nsIWebNavigation).
      QueryInterface(Ci.nsILoadContext);
  } catch (ex) {}
  return null;
}

function warn(aTitle, aMsg) {
  if (!Array.isArray(aMsg)) {
    aMsg = [aMsg];
  }

  var msg = log('Error: ' + aTitle + '\n' + aMsg.join('\n'));

  if (msg.length > 200) {
    msg = msg.substr(0, 200) + '\n...(see console log)';
  }

  PromptService.alert(null, null, msg);
}


//********** Import

function getContextMenu() {
  return window.ucjsUI.ContentArea.contextMenu;
}

function toStringForUI(aStr) {
  return window.ucjsUtil.toStringForUI(aStr);
}

function addEvent(aData) {
  window.ucjsUtil.setEventListener(aData);
}

function getNodesByXPath(aXPath, aNode) {
  return window.ucjsUtil.getNodesByXPath(aXPath, aNode);
}

function log(aMsg) {
  return window.ucjsUtil.logMessage('AppLauncher.uc.js', aMsg);
}


//********** Export

return {
  isExecutable: isExecutable,
  runApp: runApp,
  getContextMenu: getContextMenu,
  toStringForUI: toStringForUI,
  addEvent: addEvent,
  getNodesByXPath: getNodesByXPath,
  log: log
};


})(this), this);
