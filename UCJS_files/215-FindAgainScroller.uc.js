// ==UserScript==
// @name        FindAgainScroller.uc.js
// @description Customizes the scroll style on "Find again" command
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @note A default function is modified. see @modified


(function(window, undefined) {


"use strict";


/**
 * Configurations
 */
const kConfig = {
  // Skip a found result that a user can not see (e.g. a text in a popup menu
  // that does not popped up)
  // @note If a document has only invisible results, they will be selected.
  // @note WORKAROUND for Fx default behavior.
  // @see https://bugzilla.mozilla.org/show_bug.cgi?id=622801
  skipInvisible: true,

  // Align the scroll position of a found text
  // AlignPosition() has the detail setting
  // @note The result is scrolled at the center as Fx default.
  // @see https://bugzilla.mozilla.org/show_bug.cgi?id=171237
  alignPosition: true,

  // Scroll smoothly to a found text
  // SmoothScroll() has the detail setting
  smoothScroll: true,

  // Blink a found text
  // FoundBlink() has the detail setting
  foundBlink: true
};


/**
 * Wrapper of gFindBar
 * @see chrome://global/content/bindings/findbar.xml
 */
var TextFinder = (function() {
  // @see chrome://browser/content/browser.js
  const {gFindBar} = window;

  return {
    get text() {
      return gFindBar._findField.value;
    },

    get isResultFound() {
      return gFindBar._foundEditable || gFindBar._currentWindow;
    },

    get selectionController() {
      var editable = gFindBar._foundEditable;
      if (editable) {
        try {
          return editable.
            QueryInterface(window.Ci.nsIDOMNSEditableElement).
            editor.
            selectionController;
        } catch (e) {}
        return null;
      }

      if (gFindBar._currentWindow) {
        return gFindBar._getSelectionController(gFindBar._currentWindow);
      }
      return null;
    }
  };
})();


/**
 * Main function
 */
function FindAgainScroller_init() {
  var mScrollObserver = ScrollObserver();

  // Optional functions
  var mSkipInvisible = kConfig.skipInvisible && SkipInvisible();
  var mAlignPosition = kConfig.alignPosition && AlignPosition();
  var mSmoothScroll = kConfig.smoothScroll && SmoothScroll();
  var mFoundBlink = kConfig.foundBlink && FoundBlink();

  // @modified chrome://global/content/bindings/findbar.xml::
  // onFindAgainCommand
  const {gFindBar} = window;
  var $onFindAgainCommand = gFindBar.onFindAgainCommand;
  gFindBar.onFindAgainCommand = function(aFindPrevious) {
    var scrollable = mScrollObserver.attach(TextFinder.text);

    do {
      $onFindAgainCommand.apply(this, arguments);
    } while (mSkipInvisible && mSkipInvisible.test());

    if (TextFinder.isResultFound) {
      if (scrollable) {
        let isScrolled = mScrollObserver.isScrolled();

        if (mAlignPosition && (mAlignPosition.alwaysAlign || isScrolled)) {
          mAlignPosition.align(aFindPrevious);
        }
        if (mSmoothScroll && isScrolled) {
          mSmoothScroll.start(mScrollObserver.getScrolledState());
        }
      }

      if (mFoundBlink) {
        mFoundBlink.start();
      }
    }

    mScrollObserver.detach();
  };
}


/**
 * Observer of the scrollable elements
 * @return {hash}
 *   attach: {function}
 *   detach: {function}
 *   isScrolled: {function}
 *   getScrolledState: {function}
 */
function ScrollObserver() {
  var mScrollable = Scrollable();


  //********** Functions

  function Scrollable() {
    var mItems = new Map();
    var mScrolledState = null;

    // TODO: In Fx19 |Map::size| will change from a method to a property.
    // @see https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Map
    function itemsCount() mItems.size();

    // TODO: In Fx19 |Map::clear| will be available.
    // @see https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Map
    function cleanup() {
      if (itemsCount()) {
        for (let [node] of mItems) {
          mItems.delete(node);
        }
      }

      if (mScrolledState !== null) {
        mScrolledState.node = null;
        mScrolledState.start = null;
        mScrolledState.goal = null;
        mScrolledState = null;
      }
    }

    function addItem(aNode) {
      if (!mItems.has(aNode)) {
        mItems.set(aNode, getScroll(aNode));
      }
    }

    function isScrolled() {
      updateScrolledState();
      return !!mScrolledState;
    }

    function getScrolledState() {
      if (!mScrolledState) {
        updateScrolledState();
      }
      return mScrolledState;
    }

    function updateScrolledState() {
      mScrolledState = null;

      for (let [node, scroll] of mItems) {
        let now = getScroll(node);
        if (now.x !== scroll.x || now.y !== scroll.y) {
          // @note |mScrolledState| is used as the parameters of
          // |SmoothScroll::start|.
          mScrolledState = {
            node: node,
            start: scroll,
            goal: now
          };
          break;
        }
      }
    }

    return {
      get count() itemsCount(),
      cleanup: cleanup,
      addItem: addItem,
      isScrolled: isScrolled,
      getScrolledState: getScrolledState
    };
  }

  function attach(aFindText) {
    if (aFindText) {
      scanScrollables(window.content, aFindText);
      return mScrollable.count > 0;
    }
    return false;
  }

  function detach() {
    mScrollable.cleanup();
  }

  function scanScrollables(aWindow, aFindText) {
    if (aWindow.frames) {
      Array.forEach(aWindow.frames, function(frame) {
        scanScrollables(frame, aFindText);
      });
    }

    // <frame> window has |contentDocument|
    var doc = aWindow.contentDocument || aWindow.document;
    // |body| returns <body> or <frameset> element
    var root = doc.body || doc.documentElement;
    if (!root) {
      return;
    }

    // the document can be scrolled
    if (aWindow.scrollMaxX || aWindow.scrollMaxY) {
      mScrollable.addItem(aWindow);
    }

    // scan the elements that can be scrolled
    var text = aFindText.replace(/\"/g, '&quot;').replace(/\'/g, '&apos;');
    var xpath = 'descendant-or-self::*[contains(normalize-space(),"' + text +
      '")]|descendant::textarea';
    $X(xpath, root).forEach(function(node) {
      let item = testScrollable(node);
      if (item) {
        mScrollable.addItem(item);
      }
    });
  }

  function testScrollable(aNode) {
    var getComputedStyle = aNode.ownerDocument.defaultView.getComputedStyle;
    var style;

    while (aNode) {
      if (aNode instanceof Element) {
        if (aNode instanceof HTMLTextAreaElement &&
            aNode.scrollHeight > aNode.clientHeight) {
          return aNode;
        }

        style = getComputedStyle(aNode, '');
        if (
          (/^(?:scroll|auto)$/.test(style.overflowY) &&
           aNode.scrollHeight > aNode.clientHeight) ||
          (/^(?:scroll|auto)$/.test(style.overflowX) &&
           aNode.scrollWidth > aNode.clientWidth)
        ) {
          return aNode;
        }
      }
      aNode = aNode.parentNode;
    }
    return null;
  }

  function getScroll(aNode) {
    var x, y;

    if (aNode instanceof Window) {
      x = aNode.scrollX;
      y = aNode.scrollY;
    } else {
      x = aNode.scrollLeft;
      y = aNode.scrollTop;
    }

    return {x: x, y: y};
  }


  //********** Expose
  return {
    attach: attach,
    detach: detach,
    isScrolled: mScrollable.isScrolled,
    getScrolledState: mScrollable.getScrolledState
  };
}


/**
 * Handler for skipping a found result that a user can not see
 * @return {hash}
 *   test: {function}
 *
 * @note |test| is called as the loop condition in |onFindAgainCommand|.
 */
function SkipInvisible() {
  // WORKAROUND: A fail-safe option to avoiding an infinite loop. This is for
  // when a document has only invisible results and then the comparing check
  // of nodes does not work.
  const kMaxTestingCount = 50;

  var mTestingCount = 0;
  var mFirstInvisible = null;


  //********** Functions

  function test() {
    // WORKAROUND: force to exit from a loop of testing
    if (++mTestingCount > kMaxTestingCount) {
      mTestingCount = 0;
      mFirstInvisible = null;
      return false;
    }

    var invisible = getInvisibleResult();

    if (invisible) {
      // the first test passed
      if (!mFirstInvisible) {
        mFirstInvisible = invisible;
        return true;
      }

      // got a result that is tested at the first time
      if (mFirstInvisible !== invisible) {
        return true;
      }
    }

    // not found
    // 1.no invisible result is found
    // 2.an invisible result is found but it has been tested ever
    mTestingCount = 0;
    mFirstInvisible = null;
    return false;
  }

  function getInvisibleResult() {
    var selectionController = TextFinder.selectionController;
    // no result is found or error something
    if (!selectionController) {
      return null;
    }

    var result = selectionController.
      getSelection(window.Ci.nsISelectionController.SELECTION_NORMAL).
      getRangeAt(0).
      commonAncestorContainer;

    // a visible result is found
    if (isVisible(result)) {
      return null;
    }

    // found an invisible result
    return result;
  }

  function isVisible(aNode) {
    var win = aNode.ownerDocument.defaultView;
    var getComputedStyle = win.getComputedStyle;
    var style;

    while (aNode) {
      if (aNode instanceof Element) {
        if (aNode.hidden) {
          return false;
        }

        style = getComputedStyle(aNode, '');
        if (
          style.visibility !== 'visible' ||
          style.display === 'none' ||
          // TODO: Use a certain detection of an element that is out of view by
          // the position hacks.
          (style.position === 'absolute' &&
           (parseInt(style.left, 10) < 0) || (parseInt(style.top, 10) < 0))
        ) {
          return false;
        }
      }
      aNode = aNode.parentNode;
    }
    return true;
  }


  //********** Expose
  return {
    test: test
  };
}


/**
 * Handler for the alignment of the position of a found text
 * @return {hash}
 *   alwaysAlign: {boolean}
 *   align: {function}
 */
function AlignPosition() {
  const kOption = {
    // How to align the frame of the found text in percentage
    // * -1 means move the frame the minimum amount necessary in order
    // for the entire frame to be visible (if possible)
    vPosition: 50, // (%) 0:top, 50:center, 100:bottom, -1:minimum
    hPosition: -1, // (%) 0:left, 50:center, 100:right, -1:minimum

    // true: Reverse the position on 'Find previous' mode
    reversePositionOnFindPrevious: false,

    // true: Try to align when the match text is found into the current view
    // false: No scrolling in the same view
    alwaysAlign: false
  };


  //********** Functions

  function align(aFindPrevious) {
    var selection = getSelection();

    if (selection) {
      let v = kOption.vPosition, h = kOption.hPosition;

      if (kOption.reversePositionOnFindPrevious && aFindPrevious) {
        if (v > -1) v = 100 - v;
        if (h > -1) h = 100 - h;
      }

      scrollSelection(selection, v, h);
    }
  }

  function getSelection() {
    const {Ci} = window;

    var selectionController = TextFinder.selectionController;

    return selectionController &&
      selectionController.
      getSelection(Ci.nsISelectionController.SELECTION_NORMAL);
  }

  function scrollSelection(aSelection, aVPosition, aHPosition) {
    const {Ci} = window;

    aSelection.
    QueryInterface(Ci.nsISelectionPrivate).
    scrollIntoView(
      Ci.nsISelectionController.SELECTION_ANCHOR_REGION,
      true,
      aVPosition,
      aHPosition
    );
  }


  //********** Expose
  return {
    get alwaysAlign() kOption.alwaysAlign,
    align: align
  };
}


/**
 * Handler for scrolling an element smoothly
 * @return {hash}
 *   start: {function}
 *   stop: {function}
 */
function SmoothScroll() {
  const kOption = {
    // Pitch of the vertical scroll
    // * 8 pitches mean approaching to the goal by each remaining distance
    // divided by 8
    // far: The goal is out of the current view
    // near: The goal is into the view
    pitch: {far: 8, near: 2}
  };

  var mTimerID;
  var mStartTime;

  var mState = {
    init: function(aNode, aStart, aGoal) {
      if (this.goal) {
        this.uninit(true);
      }

      if (aGoal === undefined) {
        return;
      }

      var scrollable = testScrollable(aNode);
      if (!scrollable) {
        return;
      }

      this.view = scrollable.view;
      this.node = aNode;
      this.goal = aGoal;

      startScroll(aStart);
    },

    uninit: function(aForceGoal, aOnScrollStopped) {
      if (!this.goal) {
        return;
      }

      if (!aOnScrollStopped) {
        stopScroll(aForceGoal);
      }

      delete this.view;
      delete this.node;
      delete this.goal;
    }
  };


  //********** Functions

  function startScroll(aStart) {
    if (aStart) {
      doScrollTo(aStart);
    }

    mStartTime = Date.now();
    doStep(getStep(aStart || getScroll().position), mStartTime);
  }

  function doStep(aStep, aLastTime) {
    var was = getScroll();
    doScrollBy(aStep);
    var now = getScroll();

    var currentTime = Date.now();
    if (currentTime - mStartTime > 1000 || currentTime - aLastTime > 100) {
      // it takes too much time. stop stepping and jump to goal
      stopScroll(true);
    } else if (
      (was.position.x === now.position.x || was.inside.x !== now.inside.x) &&
      (was.position.y === now.position.y || was.inside.y !== now.inside.y)
    ) {
      // goal or go over a bit. stop stepping at here
      stopScroll();
    } else {
      mTimerID = setTimeout(doStep, 0, getStep(now.position), currentTime);
    }
  }

  function stopScroll(aForceGoal) {
    if (!mTimerID) {
      return;
    }

    clearTimeout(mTimerID);
    mTimerID = null;
    mStartTime = null;

    if (aForceGoal) {
      doScrollTo(mState.goal);
    }

    mState.uninit(false, true);
  }

  function getStep(aPosition) {
    var dX = mState.goal.x - aPosition.x,
        dY = mState.goal.y - aPosition.y;
    var pitchY = (Math.abs(dY) < mState.node.clientHeight) ?
      kOption.pitch.far : kOption.pitch.near;

    return Position(round(dX / 2), round(dY / pitchY));
  }

  function round(aValue) {
    if (aValue > 0) {
      return Math.ceil(aValue);
    }
    if (aValue < 0) {
      return Math.floor(aValue);
    }
    return 0;
  }

  function getScroll() {
    var x, y;
    if (mState.view) {
      x = mState.view.scrollX;
      y = mState.view.scrollY;
    } else {
      x = mState.node.scrollLeft;
      y = mState.node.scrollTop;
    }

    return {
      position: Position(x, y),
      inside: Position(x < mState.goal.x, y < mState.goal.y)
    };
  }

  function doScrollTo(aPosition) {
    if (mState.view) {
      mState.view.scrollTo(aPosition.x, aPosition.y);
    } else {
      mState.node.scrollLeft = aPosition.x;
      mState.node.scrollTop  = aPosition.y;
    }
  }

  function doScrollBy(aPosition) {
    if (mState.view) {
      mState.view.scrollBy(aPosition.x, aPosition.y);
    } else {
      mState.node.scrollLeft += aPosition.x;
      mState.node.scrollTop  += aPosition.y;
    }
  }

  function testScrollable(aNode) {
    var view = null;
    var scrollable = false;

    if (aNode instanceof Window ||
        aNode instanceof HTMLHtmlElement ||
        aNode instanceof HTMLBodyElement) {
      view = getWindow(aNode);
      scrollable = view.scrollMaxX || view.scrollMaxY;
    }
    else if (aNode instanceof HTMLTextAreaElement) {
      scrollable = aNode.scrollHeight > aNode.clientHeight;
    }
    else if (aNode instanceof Element) {
      let style = getWindow(aNode).getComputedStyle(aNode, '');
      scrollable =
        style.overflowY === 'scroll' ||
        style.overflowX === 'scroll' ||
        (style.overflowY === 'auto' &&
         aNode.scrollHeight > aNode.clientHeight) ||
        (style.overflowX === 'auto' &&
         aNode.scrollWidth > aNode.clientWidth);
    }

    if (scrollable) {
      return {view: view};
    }
    return null;
  }

  function getWindow(aNode) {
    if (aNode instanceof Window) {
      return aNode;
    }
    return aNode.ownerDocument.defaultView;
  }

  function Position(aX, aY) {
    return {x: aX, y: aY};
  }


  //********** Expose
  return {
    start: function({node, start, goal}) {
      mState.init(node, start, goal);
    },
    stop: function({forceGoal}) {
      mState.uninit(forceGoal);
    }
  };
}


/**
 * Handler for blinking a found text
 * @return {hash}
 *   start: {function}
 */
function FoundBlink() {
  const kOption = {
    // Duration of blinking (millisecond)
    duration: 2000,
    // The number of times to blink should be even
    // * 6 steps mean on->off->on->off->on->off->on
    steps: 6
  };

  var mTimerID;
  var mSelectionController;


  // Attach a cleaner when the selection is removed by clicking
  addEvent([gBrowser.mPanelContainer, 'mousedown', uninit, false]);


  //********** Functions

  function init() {
    uninit();

    var selectionController = TextFinder.selectionController;
    if (selectionController) {
      mSelectionController = selectionController;
      return true;
    }
    return false;
  }

  function uninit() {
    if (mTimerID) {
      clearInterval(mTimerID);
      mTimerID = null;
    }

    if (mSelectionController) {
      setDisplay(true);
      mSelectionController = null;
    }
  }

  function start() {
    if (!init()) {
      return;
    }

    var {duration, steps} = kOption;
    var limits = steps, blinks = 0;
    var range = getRange();

    mTimerID = setInterval(function() {
      // Check whether the selection is into the view within trial limits
      if (blinks === 0 && limits-- > 0 && !isRangeIntoView(range)) {
        return;
      }

      // Break when blinks end or trial is expired
      if (blinks === steps || limits <= 0) {
        uninit();
        return;
      }

      setDisplay(!!(blinks % 2));
      blinks++;
    }, parseInt(duration / steps, 10));
  }

  function isRangeIntoView(aRange) {
    var {top, bottom} = aRange.getBoundingClientRect();

    return 0 <= top && bottom <= window.innerHeight;
  }

  function getRange() {
    const {Ci} = window;

    return mSelectionController.
      getSelection(Ci.nsISelectionController.SELECTION_NORMAL).
      getRangeAt(0);
  }

  function setDisplay(aShow) {
    const {Ci} = window;

    try {
      mSelectionController.setDisplaySelection(
        aShow ?
        Ci.nsISelectionController.SELECTION_ATTENTION :
        Ci.nsISelectionController.SELECTION_OFF
      );

      mSelectionController.
      repaintSelection(Ci.nsISelectionController.SELECTION_NORMAL);
    } catch (e) {}
  }


  //********** Expose
  return {
    start: start
  };
}


//********** Imports

function $X(aXPath, aNode) {
  return window.ucjsUtil.getNodesByXPath(aXPath, aNode);
}

function addEvent(aData) {
  window.ucjsUtil.setEventListener(aData);
}

function log(aMsg) {
  return window.ucjsUtil.logMessage('FindAgainScroller.uc.js', aMsg);
}


//********** Entry point

FindAgainScroller_init();


})(this);
