// ==UserScript==
// @name NaviLink.uc.js
// @description Detects the links for navigation.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js

// @usage Creates items in the URLbar context menu.

// @note Some functions are exposed (window.ucjsNaviLink.XXX).

// @note This script scans only the top content document, does not traverse
// frames.


const ucjsNaviLink = (function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  getModule,
  getNodeById: $ID,
  getNodesBySelector: $S,
  getFirstNodeByXPath: $X1,
  openURL,
  unescapeURLCharacters: unescURLChar
} = window.ucjsUtil;

function $E(aTagOrNode, aAttribute) {
  return window.ucjsUtil.createNode(aTagOrNode, aAttribute, handleAttribute);
}

// For debugging.
function log(aMsg) {
  return window.ucjsUtil.logMessage('NaviLink.uc.js', aMsg);
}

const {
  URLBar: {
    contextMenu: URLBarContextMenu
  }
} = window.ucjsUI;

/**
 * Preference
 */
const kPref = {
  // Show the unregistered navigation links.
  // @see |kNaviLinkType| for the registered types.
  showSubNaviLinks: true,

  // Show the page information menu.
  // @see |kPageInfoType|
  showPageInfo: true
};

/**
 * User presets.
 *
 * @key name {string}
 *   A display name in the UI item.
 * @key URL {RegExp}
 *   A URL of a page that should be scan the navigations.
 * @key prev {XPath}
 * @key next {XPath}
 *   Set xpath of an element for navigation;
 *   Any element which has <href> attribute: Opens its URL.
 *   <input> element: Submits with its form.
 */
const kPresetNavi = [
  {
    name: 'Google Search',
    URL: /^https?:\/\/www\.google\.(?:com|co\.jp)\/(?:#|search|webhp).+/,
    prev: 'id("nav")//td[1]/a | id("nf")/parent::a',
    next: 'id("nav")//td[last()]/a | id("nn")/parent::a'
  },
  {
    name: 'DuckDuckGo Search',
    URL: /^https?:\/\/duckduckgo.com\/(?:html|lite)/,
    prev: './/input[@class="navbutton" and @value[contains(.,"Prev")]]',
    next: './/input[@class="navbutton" and @value[contains(.,"Next")]]'
  }
  //,
];

/**
 * Types of the link navigations.
 *
 * @key type {string}
 *   The value of <rel> attribute of an element that has <href> (e.g. <link>,
 *   <a>).
 * @key synonym {string} [optional]
 *   The synonymous value that is converted to <type>.
 *   @note The values can be combined with '|'.
 * @key label {string} [optional]
 *   A displayed string.
 *   @note A capitalized text of <type> will be displayed if <label> is empty.
 *
 * @note Displayed in the declared order.
 */
const kNaviLinkType = [
  {
    type: 'top',
    synonym: 'home|origin'
    //,label: 'トップページ'
  },
  {
    type: 'up',
    synonym: 'parent'
    //,label: '親ページ'
  },
  {
    type: 'first',
    synonym: 'begin|start'
    //,label: '最初のページ'
  },
  {
    type: 'prev',
    synonym: 'previous'
    //,label: '前のページ'
  },
  {
    type: 'next',
    synonym: 'child'
    //,label: '次のページ'
  },
  {
    type: 'last',
    synonym: 'end'
    //,label: '最後のページ'
  },
  {
    type: 'contents',
    synonym: 'toc'
  },
  {
    type: 'index'
  },
  {
    type: 'chapter'
  },
  {
    type: 'section'
  },
  {
    type: 'subsection'
  },
  {
    type: 'appendix'
  },
  {
    type: 'bookmark'
  },
  {
    type: 'glossary'
  },
  {
    type: 'help'
  },
  {
    type: 'search'
  },
  {
    type: 'author',
    synonym: 'made'
  },
  {
    type: 'copyright'
  },
  {
    type: 'alternate'
  }
];

/**
 * Types of the page information.
 *
 * @key type {string}
 * @key label {string} [optional]
 *   A displayed string.
 *   @note A capitalized text of <type> will be displayed if <label> is empty.
 *
 * @note Displayed in the declared order.
 */
const kPageInfoType = [
  {
    type: 'meta'
    //,label: 'メタ情報'
  },
  {
    type: 'feed'
    //,label: 'フィード'
  },
  {
    type: 'stylesheet'
    //,label: 'スタイルシート'
  },
  {
    type: 'script'
    //,label: 'スクリプト'
  },
  {
    type: 'favicon'
    //,label: 'ファビコン'
  }
];

/**
 * Types of the prev/next navigation.
 *
 * @note The values is displayed.
 */
const kSiblingScanType = {
  preset:    'プリセット',
  official:  '公式',
  searching: '推測(リンク)',
  numbering: '推測(URL)'
};

/**
 * Strings format.
 *
 * @note The values is displayed through |F()|.
 */
const kFormat = {
  // For the main categories.
  upper: '上の階層',
  prev: '前ページ - %scanType%',
  next: '次ページ - %scanType%',
  naviLink: 'Navi Link',
  pageInfo: 'Page Info',

  // For the item of <Sibling Navi>.
  preset: '[%name%] %title%',
  official: '%title%',
  searching: '%title% (%score%)',
  numbering: '%here% -> %there%',
  // Submit mode warning.
  submit: '<submit mode>',

  // For the sub items of <Navi Link>/<Page Info>.
  tooManyItems: '項目が多いので表示を制限',
  type: ['%title%', '%title% (%count%)'],
  item: ['%title%', '%title% [%attributes%]'],
  meta: '%name%: %content%'
};

/**
 * Identifiers
 */
const kID = (function() {
  const prefix = 'ucjs_NaviLink_';
  const names = [
    'upper', 'prev', 'next', 'naviLink', 'pageInfo',
    'startSeparator', 'endSeparator', 'pageInfoSeparator',
    'commandData'
  ];

  let hash = {};

  names.forEach((name) => {
    hash[name] = prefix + name;
  });

  return hash;
})();

/**
 * Handler of the menu UI settings.
 */
const MenuUI = (function() {
  function init() {
    URLBarContextMenu.register({
      events: [
        ['click', onClick, false],
        ['command', onCommand, false],
        ['popupshowing', onPopupShowing, false],
        ['popuphiding', onPopupHiding, false]
      ],

      onCreate: createMenu
    });
  }

  function createMenu(aContextMenu) {
    setSeparators(aContextMenu);
  }

  function onClick(aEvent) {
    let item = aEvent.target;

    let data = item[kID.commandData];

    if (!data) {
      return;
    }

    if (aEvent.button === 1) {
      // @see chrome://browser/content/utilityOverlay.js::closeMenus
      window.closeMenus(item);
      onCommand(aEvent);
    }
  }

  function onCommand(aEvent) {
    let item = aEvent.target;

    let data = item[kID.commandData];

    if (!data) {
      return;
    }

    /**
     * command: Load in current tab.
     * <Ctrl> / <MiddleClick>: Open a new tab.
     * <Ctrl+Shift> / <Shift+MiddleClick>: Open a new tab in background.
     */
    let {ctrlKey, shiftKey, button} = aEvent;
    let [inTab, inBackground] = [ctrlKey || button === 1,  shiftKey];

    if (data.open) {
      if (!/^(?:https?|ftp|file):/.test(data.open)) {
        log('Invalid scheme to open:\n' + data.open);

        return;
      }

      openURL(data.open, {
        inTab,
        inBackground,
        relatedToCurrent: true
      });
    }
    else if (data.submit) {
      let submit = (aDocument) => {
        try {
          aDocument.forms[data.submit].submit();
        }
        catch (ex) {
          log('Error for a form element:\n' + ex);
        }
      };

      if (inTab) {
        // TODO: A document sometimes cannot be duplicated with the same
        // content.
        // @note I have tested only 'DuckDuckGo'.
        let newTab = gBrowser.duplicateTab(gBrowser.selectedTab);

        if (!inBackground) {
          gBrowser.selectedTab = newTab;
        }

        let browser = gBrowser.getBrowserForTab(newTab);

        if (browser.contentDocument.readyState === 'complete') {
          submit(browser.contentDocument);
        }
        else {
          browser.addEventListener('load', function onLoad(event) {
            if (event.target === browser.contentDocument) {
              browser.removeEventListener('load', onLoad, true);

              submit(browser.contentDocument);
            }
          }, true);
        }
      }
      else {
        submit(getDocument());
      }
    }
  }

  function onPopupShowing(aEvent) {
    let menupopup = aEvent.target;
    let contextMenu = aEvent.currentTarget;

    if (menupopup !== contextMenu) {
      return;
    }

    if (!/^(?:https?|ftp|file)$/.test(getURI().scheme)) {
      return;
    }

    let isHTML = isHTMLDocument(getDocument());
    let [, eSep] = getSeparators();

    [
      buildUpperNavi(),
      isHTML && buildSiblingNavi('prev'),
      isHTML && buildSiblingNavi('next'),
      isHTML && buildNaviLink(),
      kPref.showPageInfo && $E('menuseparator', {id: kID.pageInfoSeparator}),
      kPref.showPageInfo && buildPageInfo()
    ].
    forEach((item) => {
      if (item) {
        contextMenu.insertBefore(item, eSep);
      }
    });
  }

  function onPopupHiding(aEvent) {
    let menupopup = aEvent.target;
    let contextMenu = aEvent.currentTarget;

    if (menupopup !== contextMenu) {
      return;
    }

    // Remove existing items.
    let [sSep, eSep] = getSeparators();

    for (let item; (item = sSep.nextSibling) !== eSep; /**/) {
      contextMenu.removeChild(item);
    }
  }

  function setSeparators(aContextMenu) {
    [
      kID.startSeparator,
      kID.endSeparator
    ].
    forEach((id) => {
      aContextMenu.appendChild($E('menuseparator', {
        id
      }));
    });
  }

  function getSeparators() {
    return [
      $ID(kID.startSeparator),
      $ID(kID.endSeparator)
    ];
  }

  function buildUpperNavi() {
    let URLList = UpperNavi.getList();

    let popup = $E('menupopup');

    if (URLList) {
      URLList.forEach((URL) => {
        popup.appendChild($E('menuitem', {
          crop: 'start',
          label: URL,
          'open': URL
        }));
      });
    }

    let menu = $E('menu', {
      id: kID.upper,
      label: kFormat.upper,
      disabled: URLList === null || null
    });

    menu.appendChild(popup);

    return menu;
  }

  function buildSiblingNavi(aDirection) {
    let result = SiblingNavi.getResult(aDirection);

    if (!result) {
      return null;
    }

    let {list, scanType} = result;

    let node;

    if (list.length === 1) {
      let data = list[0];
      let tooltiptext = formatTooltip(
        formatText(data, {
          siblingScanType: scanType
        }),
        data.URL || kFormat.submit
      );

      node = $E('menuitem', {
        tooltiptext,
        'open': data.URL,
        'submit': data.formIndex
      });
    }
    else {
      let popup = $E('menupopup');

      list.forEach((data) => {
        let text = formatText(data, {siblingScanType: scanType});
        let URL = data.URL;

        popup.appendChild($E('menuitem', {
          label: text,
          tooltiptext: formatTooltip(text, URL),
          'open': URL
        }));
      });

      node = $E('menu');
      node.appendChild(popup);
    }

    $E(node, {
      id: kID[aDirection],
      label: F(kFormat[aDirection], {
        scanType: kSiblingScanType[scanType]
      })
    });

    return node;
  }

  function buildNaviLink() {
    let naviList, subNaviList;

    naviList = NaviLink.getNaviList();

    if (kPref.showSubNaviLinks) {
      subNaviList = NaviLink.getSubNaviList();
    }

    if (!naviList && !subNaviList) {
      return null;
    }

    let popup = $E('menupopup');

    [naviList, subNaviList].forEach((result) => {
      if (!result) {
        return;
      }

      if (popup.hasChildNodes()) {
        popup.appendChild($E('menuseparator'));
      }

      result.forEach(({type, list, trimmed}) => {
        let child;
        let tooltiptext;

        if (list.length === 1) {
          let data = list[0];
          let URL = data.URL;

          child = $E('menuitem', {
            'open': URL
          });

          tooltiptext = URL;
        }
        else {
          let childPopup = $E('menupopup');

          list.forEach((data) => {
            let [text, URL] = [formatText(data), data.URL];

            childPopup.appendChild($E('menuitem', {
              crop: 'center',
              label: text,
              tooltiptext: formatTooltip(text, URL),
              'open': URL
            }));
          });

          child = $E('menu');
          child.appendChild(childPopup);

          if (trimmed) {
            tooltiptext = kFormat.tooManyItems;
          }
        }

        let label = F(kFormat.type, {
          title: getLabelForType(kNaviLinkType, type),
          count: (list.length > 1) ? list.length : null
        });

        if (tooltiptext) {
          tooltiptext = formatTooltip(label, tooltiptext);
        }

        popup.appendChild($E(child, {
          label,
          tooltiptext
        }));
      });
    });

    let menu = $E('menu', {
      id: kID.naviLink,
      label: kFormat.naviLink
    });

    menu.appendChild(popup);

    return menu;
  }

  function buildPageInfo() {
    let result = NaviLink.getInfoList();

    if (!result) {
      return null;
    }

    let popup = $E('menupopup');

    result.forEach(({type, list, trimmed}) => {
      let childPopup = $E('menupopup');

      if (type === 'meta') {
        // Only shows <meta> information with no command.
        list.forEach((data) => {
          let text = formatText(data, {meta: true});

          childPopup.appendChild($E('menuitem', {
            closemenu: 'none',
            label: text,
            tooltiptext: text
          }));
        });
      }
      else {
        list.forEach((data) => {
          let [text, URL] = [formatText(data), data.URL];

          childPopup.appendChild($E('menuitem', {
            crop: 'center',
            label: text,
            tooltiptext: formatTooltip(text, URL),
            'open': URL
          }));
        });
      }

      let child = $E('menu');

      child.appendChild(childPopup);

      popup.appendChild($E(child, {
        label: F(kFormat.type, {
          title: getLabelForType(kPageInfoType, type),
          count: (list.length > 1) ? list.length : null
        }),
        tooltiptext: trimmed ? kFormat.tooManyItems : null
      }));
    });

    let menu = $E('menu', {
      id: kID.pageInfo,
      label: kFormat.pageInfo
    });

    menu.appendChild(popup);

    return menu;
  }

  function formatText(aData, aOption) {
    aOption = aOption || {};

    if ('siblingScanType' in aOption) {
      switch (aOption.siblingScanType) {
        case 'preset':
          return F(kFormat.preset, {
            name: aData.name,
            title: aData.title
          });

        case 'official':
          return F(kFormat.official, {
            title: aData.title
          });

        case 'searching':
          return F(kFormat.searching, {
            title: aData.title,
            score: +(aData.score).toFixed(5)
          });

        case 'numbering':
          return F(kFormat.numbering, {
            here: aData.here,
            there: aData.there
          });
      }

      // Unreachable here, but avoid warnings.
      return null;
    }

    if (aOption.meta) {
      return F(kFormat.meta, {
        name: aData.name,
        content: aData.content
      });
    }

    return F(kFormat.item, {
      title: aData.title,
      attributes: formatAttributes(aData.attributes) || null
    });
  }

  /**
   * Attributes formatter.
   *
   * @param aAttributes {array}
   *   [['name', 'value'], ..., ['rel', ['value', 'value', ...]]]
   *   @see |NaviLink| for detail.
   * @return {string}
   */
  function formatAttributes(aAttributes) {
    const kAttributeFormat = '%name%: %value%',
          kValuesDelimiter = ',',
          kAttributesDelimiter = ' ';

    if (!aAttributes || !aAttributes.length) {
      return '';
    }

    let attributes = [];

    aAttributes.forEach(([name, value]) => {
      if (Array.isArray(value)) {
        value = value.join(kValuesDelimiter);
      }

      if (value) {
        attributes.push(F(kAttributeFormat, {
          name,
          value
        }));
      }
    });

    return attributes.join(kAttributesDelimiter);
  }

  function formatTooltip(aText, aURL) {
    if (aText && aText !== getLeaf(aURL)) {
      return aText + '\n' + aURL;
    }

    return aURL;
  }

  function getLabelForType(aTypeList, aType) {
    function capitalize(aText) {
      return aText.substr(0, 1).toUpperCase() + aText.substr(1);
    }

    for (let i = 0, l = aTypeList.length; i < l; i++) {
      let {type, label} = aTypeList[i];

      type = type.toLowerCase();

      if (type === aType) {
        return label || capitalize(type);
      }
    }

    return aType;
  }

  return {
    init
  };
})();

/**
 * Handler of the user preset of the navigation links.
 */
const PresetNavi = (function() {
  /**
   * Gets the preset data for the previous or next page.
   * @param aDirection {string}
   *   'prev' or 'next'.
   * @return {hash|null}
   *   name:
   *   title:
   *   URL or formIndex:
   */
  function getData(aDirection) {
    let item;

    let URL = getURI().spec;

    for (let i = 0; i < kPresetNavi.length; i++) {
      if (kPresetNavi[i].URL.test(URL)) {
        item = kPresetNavi[i];
        break;
      }
    }

    if (!item) {
      return null;
    }

    let node = $X1(item[aDirection], getDocument());

    if (node && node.href) {
      return {
        // <data> for a preset.
        name: item.name,
        title: trim(node.title) || trim(node.textContent) || '',
        URL: node.href
      };
    }

    if (node instanceof HTMLInputElement && node.form && node.value) {
      let index = 0;

      for (let form of getDocument().forms) {
        if (node.form === form) {
          break;
        }

        index++;
      }

      return {
        // <data> for a submit preset.
        name: item.name,
        title: node.value,
        formIndex: index
      };
    }

    log('Match preset: %name%\n%dir%: \'%xpath%\' is not found'.
      replace('%name%', item.name).
      replace('%dir%', aDirection).
      replace('%xpath%', item[aDirection]));

    return {
      error: true
    };
  }

  return {
    getData
  };
})();

/**
 * Handler of the official navigation links according to the <rel> attribute.
 *
 * @note [additional] Makes a list of the page information.
 */
const NaviLink = (function() {
  const kFeedType = {
    'application/rss+xml': 'RSS',
    'application/atom+xml': 'ATOM',
    'text/xml': 'XML',
    'application/xml': 'XML',
    'application/rdf+xml': 'XML'
  };

  /**
   * The max number of the items of each type.
   */
  const kMaxNumItemsOfType = 20;

  /**
   * Handler of the types of link navigations.
   *
   * @see |kNaviLinkType|
   */
  const NaviLinkTypeFixup = (function() {
    let naviLinkType = {};
    let naviLinkTypeConversion = {};

    kNaviLinkType.forEach(({type, synonym}) => {
      naviLinkType[type] = true;

      if (synonym) {
        synonym.toLowerCase().split('|').forEach((item) => {
          naviLinkTypeConversion[item] = type;
        });
      }
    });

    function registered(aType) {
      let type = naviLinkTypeConversion[aType] || aType;

      if (type in naviLinkType) {
        return type;
      }

      return '';
    }

    function unregistered(aType) {
      let type = naviLinkTypeConversion[aType] || aType;

      if (!(type in naviLinkType)) {
        return type;
      }

      return '';
    }

    return {
      registered,
      unregistered
    };
  })();

  let mURL = '';
  let mNaviList, mSubNaviList, mInfoList;

  function init() {
    let URI = getURI();

    if (!URI.isSamePage(mURL)) {
      mURL = URI.spec;
      [mNaviList, mSubNaviList, mInfoList] = getLinkList();
    }
  }

  /**
   * Retrieves the first data of the list for the type.
   *
   * @param aType {string}
   *   |kNaviLinkType.type| or |kPageInfoType.type|.
   * @return {hash|null}
   *   title:
   *   attributes:
   *   URL:
   *
   *   For <meta>;
   *   name:
   *   content:
   *
   *   @see |addItem()| for detail.
   */
  function getData(aType) {
    let result = getNaviList();

    if (result) {
      for (let i = 0, l = result.length; i < l; i++) {
        if (result[i].type === aType) {
          return result[i].list[0];
        }
      }
    }

    return null;
  }

  /**
   * Retrieves the list by types.
   *
   * @return {hash[]|null}
   *   type: |kNaviLinkType.type| or |kPageInfoType.type|.
   *   list: {<data>[]}
   *     @see |getData()| for detail.
   *   trimmed: {boolean}
   *     whether a list has been cut because of too much items.
   */
  function getNaviList() {
    init();

    return mNaviList;
  }

  function getSubNaviList() {
    init();

    return mSubNaviList;
  }

  function getInfoList() {
    init();

    return mInfoList;
  }

  function getLinkList() {
    let naviList = {},
        subNaviList = {},
        infoList = {};

    scanMeta(infoList);
    scanScript(infoList);

    Array.forEach($S('[rel][href], [rev][href]', getDocument()), (node) => {
      let rel = node.rel || node.rev;

      if (!rel ||
          !node.href ||
          !/^(?:https?|mailto):/.test(node.href)) {
        return;
      }

      let rels = makeRels(rel);

      scanInfoLink(infoList, node, rels) ||
      scanNaviLink(naviList, node, rels) ||
      scanSubNaviLink(subNaviList, node, rels);
    });

    return [
      {
        list: naviList,
        orderList: kNaviLinkType
      },
      {
        list: subNaviList
      },
      {
        list: infoList,
        orderList: kPageInfoType
      }
    ].map(formatList);
  }

  function formatList({list, orderList}) {
    let types = Object.keys(list);

    if (!types.length) {
      return null;
    }

    sortByTypeOrder(types, orderList);

    let result = [];

    types.forEach((type) => {
      let resultList = [];
      let trimmed = false;

      list[type].some((data) => {
        if (testUniqueData(resultList, data)) {
          resultList.push(data);

          // Stop scanning the source list.
          if (resultList.length >= kMaxNumItemsOfType) {
            trimmed = true;

            return true;
          }
        }

        return false;
      });

      result.push({
        type,
        list: resultList,
        trimmed
      });
    });

    return result;
  }

  function testUniqueData(aArray, aData) {
    return aArray.every((data) => {
      for (let key in data) {
        // <attributes> is {array}, the others are {string}.
        if (key === 'attributes') {
          if (data[key].join() !== aData[key].join()) {
            return true;
          }
        }
        else if (data[key] !== aData[key]) {
          return true;
        }
      }

      return false;
    });
  }

  function makeRels(aRelAttribute) {
    let rels = aRelAttribute.toLowerCase().split(/\s+/);

    let relsList = {};

    rels.forEach((aValue) => {
      relsList[aValue] = true;
    });

    Object.defineProperty(relsList, 'exceptFor', {
      value: function(aSourceValue) {
        if (rels.length > 1) {
          return rels.filter((aValue) => aValue !== aSourceValue);
        }

        return [];
      }
    });

    return relsList;
  }

  function scanMeta(aList) {
    let doc = getDocument();
    let metas = Array.slice(doc.getElementsByTagName('meta'));

    // Add <content-type> to avoid an empty meta list.
    let empty = !metas.some((meta) =>
      meta.httpEquiv &&
      meta.httpEquiv.toLowerCase() === 'content-type'
    );

    if (empty) {
      metas.unshift({
        httpEquiv: 'Content-Type',
        content: doc.contentType + ';charset=' + doc.characterSet
      });
    }

    metas.forEach((node) => {
      addItem(aList, 'meta', node);
    });
  }

  function scanScript(aList) {
    let doc = getDocument();

    Array.forEach(doc.getElementsByTagName('script'), (node) => {
      addItem(aList, 'script', node);
    });
  }

  function scanInfoLink(aList, aNode, aRels) {
    let type = '';
    let attributes = [];

    if (aRels.feed ||
        (aNode.type && aRels.alternate && !aRels.stylesheet)) {
      const {Feeds} = getModule('app/modules/Feeds.jsm');

      let feedType =
        Feeds.isValidFeed(aNode, getDocument().nodePrincipal, aRels.feed);

      if (feedType) {
        type = 'feed';
        attributes.push(['type', kFeedType[feedType] || 'RSS']);
      }
    }
    else if (aRels.stylesheet) {
      type = 'stylesheet';
      attributes.push(['media', aNode.media || 'all']);
    }
    else if (aRels.icon) {
      type = 'favicon';

      if (aNode.type) {
        attributes.push(['type', aNode.type]);
      }
    }

    if (type) {
      addItem(aList, type, aNode, attributes);

      return true;
    }

    return false;
  }

  function scanNaviLink(aList, aNode, aRels) {
    let attributes = [];

    if (aRels.alternate) {
      if (aNode.media) {
        attributes.push(['media', aNode.media]);
      }

      if (aNode.hreflang) {
        attributes.push(['hreflang', aNode.hreflang]);
      }
    }

    let itemNums = 0;

    for (let type in aRels) {
      type = NaviLinkTypeFixup.registered(type);

      if (type) {
        attributes.push(['rel', aRels.exceptFor(type)]);
        addItem(aList, type, aNode, attributes);
        itemNums++;
      }
    }

    return itemNums > 0;
  }

  function scanSubNaviLink(aList, aNode, aRels) {
    for (let type in aRels) {
      type = NaviLinkTypeFixup.unregistered(type);

      if (type) {
        addItem(aList, type, aNode, [['rel', aRels.exceptFor(type)]]);
      }
    }
  }

  function addItem(aList, aType, aNode, aAttributes) {
    let data;

    if (aType === 'meta') {
      data = getMetaData(aNode);
    }
    else {
      data = getNodeData(aNode, aAttributes);
    }

    if (data) {
      if (!(aType in aList)) {
        aList[aType] = [];
      }

      aList[aType].push(data);
    }
  }

  function getMetaData(aNode) {
    let content = trim(aNode.content);

    if (!content) {
      return null;
    }

    let name =
      trim(aNode.name) ||
      trim(aNode.httpEquiv) ||
      trim(aNode.getAttribute('property')) ||
      trim(aNode.getAttribute('itemprop')) ;

    if (name) {
      return {
        // <data> for a meta.
        name,
        content
      };
    }

    return null;
  }

  function getNodeData(aNode, aAttributes) {
    let URL = trim(aNode.href) || trim(aNode.src);

    if (!URL) {
      return null;
    }

    let title =
      trim(aNode.title) ||
      (!/^(?:script|link)$/.test(aNode.localName) &&
       trim(aNode.textContent)) ||
      getLeaf(URL);

    if (title) {
      return {
        // <data> for a script or rel.
        title,
        attributes: aAttributes || [],
        URL
      };
    }

    return null;
  }

  function sortByTypeOrder(aTypes, aOrderList) {
    if (aTypes.length <= 1) {
      return;
    }

    let order;

    if (aOrderList && aOrderList.length) {
      if (aOrderList.length <= 1) {
        return;
      }

      order = aOrderList.map((aItem) => aItem.type.toLowerCase());
    }

    let comparator = order ?
      (a, b) => order.indexOf(a) - order.indexOf(b) :
      (a, b) => a.localeCompare(b);

    aTypes.sort(comparator);
  }

  return {
    getData,
    getNaviList,
    getSubNaviList,
    getInfoList
  };
})();

/**
 * Handler of links to the sibling(prev/next) page.
 */
const SiblingNavi = (function() {
  // Max number of links that are scanned to guess the sibling page.
  const kMaxNumScanningLinks = 200;
  // Max number of entries that are scored as the sibling page.
  const kMaxNumScoredEntries = 100;
  // Max number of guessed siblings to display.
  const kMaxNumSiblings = 3;

  /**
   * Retrieves the URL string for the direction.
   *
   * @param aDirection {string}
   *   'prev' or 'next'.
   * @return {string}
   */
  function getURLFor(aDirection) {
    let result = getResult(aDirection);

    return (result && result.list[0].URL) || '';
  }

  /**
   * Gets the information for the previous or next page.
   *
   * @param aDirection {string}
   *   'prev' or 'next'.
   * @return {hash|null}
   *   list: {<data>[]}
   *   scanType: {string}
   *     @see |kSiblingScanType| for detail.
   *
   * <data> has the proper members assigned to |kSiblingScanType|.
   * {name:, title:, URL:} for a <preset>.
   * {name:, title:, formIndex:} for a submit <preset>.
   * {name:, content:} for a meta of <official>.
   * {title:, attributes:, URL:} for a script or rel of <official>.
   * {title:, score:, URL:} for a sibling by <searching>.
   * {here:, there:, URL:} for a sibling by <numbering>.
   */
  function getResult(aDirection) {
    let data;
    let scanType;

    [
      ['preset', PresetNavi.getData],
      ['official', NaviLink.getData],
      ['searching', guessBySearching],
      ['numbering', guessByNumbering]
    ].
    some(([type, getter]) => {
      let result = getter(aDirection);

      if (result) {
        data = result;
        scanType = type;

        return true;
      }

      return false;
    });

    if (data && !data.error) {
      return {
        list: Array.isArray(data) ? data : [data],
        scanType
      };
    }

    return null;
  }

  /**
   * Gets a list of the prev/next page by searching links.
   *
   * @param aDirection {string}
   *   'prev' or 'next'.
   * @return {<data>[]|null}
   * <data> {hash}
   *   title: {string}
   *   score: {number}
   *   URL: {string}
   *
   * @note Allows only URL that has the same as the base domain of the document
   * to avoid jumping to the outside by a 'prev/next' command.
   */
  function guessBySearching(aDirection) {
    let URI = getURI('NO_REF');

    NaviLinkScorer.init(URI, aDirection);

    let entries = getSearchEntries();
    let link, href, text, score;

    for (link in getSearchLinks()) {
      href = link.href;

      if (entries.contains(href) ||
          !href ||
          !/^https?:/.test(href) ||
          URI.isSamePage(href) ||
          !URI.isSameBaseDomain(href)) {
        continue;
      }

      for (text in getSearchTexts(link)) {
        // Normalize white-spaces.
        text = trim(text);

        score = text && NaviLinkScorer.score(text, href);

        if (score) {
          entries.add(text, href, score);

          break;
        }
      }

      if (entries.isFull()) {
        break;
      }
    }

    return entries.collect();
  }

  function getSearchEntries() {
    let entries = [];
    let URLs = [];

    function detach() {
      entries.length = 0;
      URLs.length = 0;
    }

    function add(aText, aURL, aScore) {
      entries[entries.length] = {
        text: aText,
        URL: aURL,
        score: aScore
      };

      // Cache for |contains()|.
      URLs[URLs.length] = aURL;
    }

    function contains(aURL) {
      return URLs.indexOf(aURL) > -1;
    }

    function isFull() {
      return entries.length >= kMaxNumScoredEntries;
    }

    function collect() {
      if (!entries.length) {
        return null;
      }

      // Sort items in a *descending* of the score.
      entries.sort((a, b) => b.score - a.score);

      let list = entries.map(({text, URL, score}) => {
        return {
          // <data> for a sibling by searching.
          title: text,
          score,
          URL
        };
      });

      detach();

      return trimSiblingsList(list);
    }

    return {
      add,
      contains,
      isFull,
      collect
    };
  }

  function getSearchLinks() {
    let links = getDocument().links;
    let count = links.length;

    if (kMaxNumScanningLinks < count) {
      let limit = Math.floor(kMaxNumScanningLinks / 2);

      for (let i = 0; i < limit; i++) {
        yield links[i];
      }

      for (let i = count - limit; i < count; i++) {
        yield links[i];
      }
    }
    else {
      for (let i = 0; i < count; i++) {
        yield links[i];
      }
    }
  }

  function getSearchTexts(aNode) {
    yield aNode.textContent;
    yield aNode.getAttribute('title');

    let images = aNode.getElementsByTagName('img');
    let image = images.length ? images[0] : null;

    if (image) {
      yield image.getAttribute('alt');
      yield image.getAttribute('title');
      yield getLeaf(image.getAttribute('src'));
    }
  }

  /**
   * Gets a list of the prev/next page by numbering of URL.
   *
   * @param aDirection {string}
   *   'prev' or 'next'.
   * @return {<data>[]|null}
   *   <data> {hash}
   *     here: {string}
   *     there: {string}
   *     URL: {string}
   */
  function guessByNumbering(aDirection) {
    /**
     * Patterns like the page numbers in URL.
     *
     * @const kNumQuery {RegExp}
     *   Query with a numeric value; [?&]page=123 or [?&]123
     * @const kNumEndPath {RegExp}
     *   Path ended with numbers; (abc)123 or (abc)123.jpg or (abc)123/
     */
    const kNumQuery =
      /([?&](?:[a-z_-]{1,20}=)?)(\d{1,12})(?=$|&)/ig;
    const kNumEndPath =
      /(\/[a-z0-9_-]{0,20}?)(\d{1,12})(\.\w+|\/)?(?=$|\?)/ig;

    let URI = getURI('NO_REF');

    if (!URI.hasPath()) {
      return null;
    }

    let direction = (aDirection === 'next') ? 1 : -1;
    let list = [];

    [kNumQuery, kNumEndPath].forEach((pattern) => {
      let URL = URI.spec;
      let matches;

      while ((matches = pattern.exec(URL))) {
        let [match, leading , oldNum, trailing] = matches;

        let newNum = parseInt(oldNum, 10) + direction;

        if (newNum > 0) {
          newNum = String(newNum);

          while (newNum.length < oldNum.length) {
            newNum = '0' + newNum;
          }

          let newVal = leading + newNum + (trailing || '');

          list.push({
            // <data> for a sibling by numbering.
            here: match,
            there: newVal,
            URL: URL.replace(match, newVal)
          });
        }
      }
    });

    if (list.length) {
      return trimSiblingsList(list);
    }

    return null;
  }

  function trimSiblingsList(aList) {
    return aList.slice(0, kMaxNumSiblings);
  }

  return {
    getResult,
    getPrev: function() {
      return getURLFor('prev');
    },
    getNext: function() {
      return getURLFor('next');
    }
  };
})();

/**
 * Evaluator of the navigation-like text and URL.
 */
const NaviLinkScorer = (function() {
  const TextScorer = (function() {
    // &lsaquo;(<):\u2039, &laquo;(<<):\u00ab, ＜:\uff1c, ≪:\u226a,
    // ←:\u2190
    // &rsaquo;(>):\u203a, &raquo;(>>):\u00bb, ＞:\uff1e, ≫:\u226b,
    // →:\u2192
    const kNaviSign = {
      prev: '<|\\u2039|\\u00ab|\\uff1c|\\u226a|\\u2190',
      next: '>|\\u203a|\\u00bb|\\uff1e|\\u226b|\\u2192'
    };

    // 前:\u524D, 古い:\u53e4\u3044
    // 次:\u6b21, 新し:\u65b0\u3057
    const kNaviWord = {
      prev: {
        en: 'prev(?:ious)?|old(?:er)?|back(?:ward)?|less',
        ja: '\\u524d|\\u53e4\\u3044'
      },
      next: {
        en: 'next|new(?:er)?|forward|more',
        ja: '\\u6b21|\\u65b0\\u3057'
      }
    };

    // Score weighting.
    const kScoreWeight = normalizeWeight({
      matchSign: 50,
      matchWord: 50,
      noOppositeWord: 25,
      lessText: 20
    });

    let mNaviSign = null,
        mNaviWord = null;

    function init(aDirection) {
      let sign, word;
      let forward, backward;

      let opposite = (aDirection === 'prev') ? 'next' : 'prev';

      // Set up data for finding a navigation sign.
      // @note The white-spaces of a test text are normalized.
      sign = kNaviSign[aDirection];
      forward = RegExp('^(?:' + sign + ')+|(?:' +  sign + ')+$');
      backward = RegExp(kNaviSign[opposite]);

      mNaviSign = initNaviData(forward, backward);

      // Set up data for finding a text string or an image filename like a
      // navigation.
      // @note The white-spaces of a test text are normalized.
      // @note Allows the short leading words before an english navigation
      // word (e.g. 'Go to next page', 'goto-next-page.png').
      word = kNaviWord[aDirection];

      let en = '(?:^|^[- \\w]{0,10}[-_ ])(?:' + word.en + ')(?:$|[-_. ])';
      let ja = '^(?:' +  word.ja + ')';

      forward = RegExp(en + '|' +  ja, 'i');

      word = kNaviWord[opposite];
      backward = RegExp(word.en + '|' +  word.ja, 'i');

      mNaviWord = initNaviData(forward, backward);
    }

    function initNaviData(aForward, aBackward) {
      function hasOpposite(aText) {
        if (!aText) {
          return false;
        }

        return aBackward.test(aText);
      }

      function match(aText) {
        if (!aText) {
          return null;
        }

        let matches = aForward.exec(aText);

        if (!matches) {
          return null;
        }

        return {
          remainingText: aText.replace(matches[0], '').trim()
        };
      }

      return {
        hasOpposite,
        match
      };
    }

    function score(aText) {
      let point = 0;
      let match;

      // Test signs for navigation.
      if (!mNaviSign.hasOpposite(aText)) {
        match = mNaviSign.match(aText);

        if (match) {
          point += kScoreWeight.matchSign;

          aText = match.remainingText;
        }
      }

      // Test words for navigation.
      match = mNaviWord.match(aText);

      if (match) {
        point += kScoreWeight.matchWord;

        aText = match.remainingText;

        if (!mNaviWord.hasOpposite(aText)) {
          point += kScoreWeight.noOppositeWord;
        }
      }

      // Test the text length.
      if (point) {
        if (aText) {
          // The text seems less to be for navigation if more than 10
          // characters remain.
          let rate = (aText.length < 10) ? 1 - (aText.length / 10) : 0;

          point += (kScoreWeight.lessText * rate);
        }
        else {
          // Exact match.
          point += kScoreWeight.lessText;
        }
      }

      return point;
    }

    return {
      init,
      score
    };
  })();

  const URLScorer = (function() {
    const kScoreWeight = normalizeWeight({
      lengthRate: 30,
      contentRate: 70
    });

    let mURLData = null;

    function init(aURI) {
      mURLData = initURLData(aURI);
    }

    function initURLData(aOriginalURI) {
      let originalPrePath = aOriginalURI.prePath;
      let originalPath = aOriginalURI.path;

      let originalURL = createData(originalPath);

      function match(aURL) {
        // @note A target URL might be including the original URL encoded.
        aURL = unescURLChar(aURL);

        let index = aURL.indexOf(originalPrePath);

        // No information of the original URL.
        if (index < 0) {
          return null;
        }

        let otherPath = aURL.substr(index + originalPrePath.length);

        // No information for comparison.
        if (!otherPath || otherPath === '/' || otherPath === originalPath) {
          return null;
        }

        return {
          originalURL,
          otherURL: createData(otherPath)
        };
      }

      function createData(aPath) {
        return {
          path: aPath,
          parts: breakApart(aPath)
        };
      }

      function breakApart(aPath) {
        // Make an array of parts for comparison excluding empty values.
        return aPath.split(/[-_./?#&=]/).filter(Boolean);
      }

      return {
        match
      };
    }

    function score(aURL) {
      let URLData = mURLData.match(aURL);

      if (!URLData) {
        return 0;
      }

      let point = 0;

      point += kScoreWeight.lengthRate * getLengthRate(URLData);
      point += kScoreWeight.contentRate * getContentRate(URLData);

      return point;
    }

    function getLengthRate({originalURL, otherURL}) {
      let originalLength = originalURL.path.length,
          otherLength = otherURL.path.length;

      // Be less than (1.0).
      return 1 - (Math.abs(originalLength - otherLength) /
        (originalLength + otherLength));
    }

    function getContentRate({originalURL, otherURL}) {
      let originalParts = originalURL.parts,
          otherParts = otherURL.parts;

      let matches = originalParts.filter((part) => {
        let i = otherParts.indexOf(part);

        if (i > -1) {
          delete otherParts[i];

          return true;
        }

        return false;
      });

      // Be less than (1.0).
      return matches.length / originalParts.length;
    }

    return {
      init,
      score
    };
  })();

  let mURL = '',
      mDirection = '';

  function init(aURI, aDirection) {
    if (!aURI.isSamePage(mURL)) {
      mURL = aURI.spec;
      mDirection = '';

      URLScorer.init(aURI);
    }

    if (mDirection !== aDirection) {
      mDirection = aDirection;

      TextScorer.init(aDirection);
    }
  }

  function score(aText, aURL) {
    let point = TextScorer.score(aText);

    if (point) {
      point += URLScorer.score(aURL);
    }

    if (point < 1) {
      return 0;
    }

    return point;
  }

  function normalizeWeight(aWeights) {
    let total = 0;

    for (let key in aWeights) {
      total += aWeights[key];
    }

    for (let key in aWeights) {
      aWeights[key] /= total;
    }

    return aWeights;
  }

  return {
    init,
    score
  };
})();

/**
 * Handler of the links to the upper(top/parent) page.
 */
const UpperNavi = (function() {
  /**
   * Gets the list of the upper page URLs from parent to top in order.
   *
   * @return {string[]}
   */
  function getList() {
    let list = [];

    let URI = getURI('NO_QUERY');
    let URL;

    while ((URL = getParent(URI))) {
      list.push(URL);
      URI = createURI(URL);
    }

    return list.length ? list : null;
  }

  function getParent(aURI) {
    if (aURI.hasPath()) {
      let path = aURI.path.replace(/\/(?:index\.html?)?$/i, '')
      let segments = path.split('/');

      // Remove the last one.
      segments.pop();

      let URL = aURI.prePath + segments.join('/') + '/';

      return (URL !== 'file:///') ? URL : '';
    }

    return getUpperHost(aURI);
  }

  function getTop(aURI) {
    if (aURI.scheme === 'file') {
      let match = /^(file:\/\/\/[a-z]:\/).+/i.exec(aURI.spec);

      return match ? match[1] : '';
    }

    return aURI.hasPath() ? aURI.prePath + '/' : getUpperHost(aURI);
  }

  function getUpperHost(aURI) {
    let host = aURI.host;

    if (!host) {
      return '';
    }

    if (aURI.baseDomain !== host) {
      let levels = host.split('.');

      levels.shift();

      return aURI.scheme + '://' + levels.join('.') + '/';
    }

    return '';
  }

  return {
    getList,
    getParent: function() {
      return getParent(getURI('NO_QUERY'));
    },
    getTop: function() {
      return getTop(getURI('NO_QUERY'));
    }
  };
})();

/**
 * Gets the document object of the current content.
 */
function getDocument() {
  return gBrowser.contentDocument;
}

/**
 * Gets the URI object of the current content.
 */
function getURI(aFlag) {
  return createURI(getDocument().documentURI, aFlag);
}

/**
 * URI object wrapper.
 */
function createURI(aURI, aFlag) {
  aURI = makeURI(aURI);

  let {scheme, prePath, path, spec} = aURI;
  let noRefSpec = removeRef(spec);
  let host = getHost(aURI);
  let baseDomain = getBaseDomain(aURI);

  switch (aFlag) {
    case 'NO_QUERY':
      path = removeQuery(path);
      spec = removeQuery(spec);
      // Fall through.

    case 'NO_REF':
      path = removeRef(path);
      spec = removeRef(spec);
      break;
  }

  function removeQuery(aTargetURL) {
    return aTargetURL.replace(/\?.*$/, '');
  }

  function removeRef(aTargetURL) {
    return aTargetURL.replace(/#.*$/, '');
  }

  function hasPath() {
    return path !== '/';
  }

  function isSamePage(aTargetURL) {
    return removeRef(aTargetURL) === noRefSpec;
  }

  function isSameBaseDomain(aTargetURL) {
    return getBaseDomain(makeURI(aTargetURL)) === baseDomain;
  }

  return {
    scheme,
    host,
    baseDomain,
    prePath,
    path,
    spec,
    hasPath,
    isSamePage,
    isSameBaseDomain
  };
}

function makeURI(aURL) {
  if (aURL instanceof Ci.nsIURI) {
    return aURL;
  }

  try {
    return Services.io.newURI(aURL, null, null);
  }
  catch (ex) {}

  return null;
}

function getHost(aURI) {
  if (!aURI) {
    return '';
  }

  try {
    // @note Returns an empty string for the host of 'file:///C:/...'.
    return aURI.host;
  }
  catch (ex) {}

  return aURI.spec.
    match(/^(?:[a-z]+:\/\/)?(?:[^\/]+@)?\[?(.+?)\]?(?::\d+)?(?:\/|$)/)[1];
}

function getBaseDomain(aURI) {
  if (!aURI) {
    return '';
  }

  /**
   * WORKAROUND: |nsIEffectiveTLDService::getBaseDomain| returns a wrong value
   * for a specific host.
   *
   * For http://gitbookio.github.io/javascript/
   * Expected;
   *   base domain = github.io
   *   public suffix = io
   * Actual;
   *   base domain = gitbookio.github.io
   *   public suffix = github.io
   */
  const kBadHosts = [
    'github.io'
  ];

  if (/^(?:https?|ftp)$/.test(aURI.scheme)) {
    for (let host of kBadHosts) {
      if (aURI.host.endsWith(host)) {
        return host;
      }
    }
  }

  try {
    // @note |getBaseDomain| returns a value in ACE format for IDN.
    let baseDomain = Services.eTLD.getBaseDomain(aURI);
    let IDNService = Cc['@mozilla.org/network/idn-service;1'].
      getService(Ci.nsIIDNService);

    return IDNService.convertACEtoUTF8(baseDomain);
  }
  catch (ex) {}

  return getHost(aURI);
}

function handleAttribute(aNode, aName, aValue) {
  switch (aName) {
    // Set the value to a property of the node.
    case 'open':
    case 'submit': {
      if (aValue) {
        aNode[kID.commandData] = {};
        aNode[kID.commandData][aName] = aValue;
      }

      return true;
    }
  }

  return false;
}

/**
 * String formatter.
 *
 * @param aFormat {string|string[]}
 *   @see |kFormat| for detail.
 * @param aReplacement {hash}
 * @return {string}
 */
function F(aFormat, aReplacement) {
  // Filter items that its value is |null| or |undefined|.
  let replacement = {};

  for (let [name, value] in Iterator(aReplacement)) {
    if (value !== null && value !== undefined) {
      replacement['%' + name + '%'] = value;
    }
  }

  if (!Array.isArray(aFormat)) {
    aFormat = [aFormat];
  }

  // Retreive a format that has all aliases of the name of replacements.
  let format;
  let names = Object.keys(replacement);

  for (let i = 0, l = aFormat.length; i < l; i++) {
    if (names.every((name) => aFormat[i].contains(name))) {
      format = aFormat[i];
      break;
    }
  }

  if (!format) {
    return aFormat[0];
  }

  for (let [name, value] in Iterator(replacement)) {
    format = format.replace(name, value);
  }

  return format;
}

function isHTMLDocument(aDocument) {
  if (aDocument instanceof HTMLDocument) {
    let mime = aDocument.contentType;

    return (
      mime === 'text/html' ||
      mime === 'text/xml' ||
      mime === 'application/xml' ||
      mime === 'application/xhtml+xml'
    );
  }

  return false;
}

function getLeaf(aURL) {
  if (aURL) {
    let lastSlash = aURL.replace(/[?#].*$/, '').lastIndexOf('/');

    return aURL.slice(lastSlash + 1) || aURL;
  }

  return '';
}

function trim(aText) {
  if (aText) {
    return aText.trim().replace(/\s+/g, ' ');
  }

  return '';
}

/**
 * Entry point.
 */
function NaviLink_init() {
  MenuUI.init();
}

NaviLink_init();

/**
 * Expose
 */
return {
  getNext: SiblingNavi.getNext,
  getPrev: SiblingNavi.getPrev,
  getParent: UpperNavi.getParent,
  getTop: UpperNavi.getTop
};


})(this);
