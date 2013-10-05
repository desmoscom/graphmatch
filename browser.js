var Browser = (function () {

  var Browser = {
    IS_IE8: navigator.userAgent.match(/MSIE 8.0/i) !== null,
    IS_IE9: navigator.userAgent.match(/MSIE 9.0/i) !== null,
    IS_IE: navigator.userAgent.match(/MSIE/i) !== null,
    IS_IPAD: navigator.userAgent.match(/iPad/i) !== null,
    IS_MOBILE: navigator.userAgent.match(/Mobile|Android/i) !== null,
    IS_ANDROID: navigator.userAgent.match(/Android/i) !== null,
    IS_KINDLE: navigator.userAgent.match(/Kindle/i) !== null || navigator.userAgent.match(/Silk/i) !== null
  };

  // Need to detet opera less than 12 because the implementation of webworkers
  // there breaks.
  Browser.IS_OPERA_LT_12 = (function () {
    if (!navigator.userAgent.match(/OPERA/i)) return false;

    var match = navigator.userAgent.match(/Version\/(\d+)/);
    if (!(match && match[1])) return false;

    var operaVersion = parseInt(match[1], 10);
    return operaVersion < 12;
  })();

  // Returns translate3d if supported, translate otherwise
  // from http://stackoverflow.com/questions/5661671/detecting-transform-translate3d-support
  //
  // Needs document.body to be defined before it can run (so that we can put
  // an element into it). In supported browsers, the value will be set to
  // true on $(document).ready();
  Browser.SUPPORTS_TRANSLATE3D = false;
  
  $(document).ready(function() {
    var el = document.createElement('p');
    var has3d;
    var computedStyle;
    var transforms = {
      'webkitTransform':'-webkit-transform',
      'OTransform':'-o-transform',
      'msTransform':'-ms-transform',
      'MozTransform':'-moz-transform',
      'transform':'transform'
    };
    // Add it to the body to get the computed style.
    document.body.insertBefore(el, null);
    for (var t in transforms) {
      if (el.style[t] !== undefined) {
        el.style[t] = "translate3d(1px,1px,1px)";
        computedStyle = window.getComputedStyle(el);
        if (!computedStyle) return;
        has3d = computedStyle.getPropertyValue(transforms[t]);
      }
    }
    document.body.removeChild(el);
    Browser.SUPPORTS_TRANSLATE3D = (
      has3d !== undefined &&
      has3d.length > 0 &&
      has3d !== "none"
    );
  });
  
  //return a generated rule for an x-y translation. use translate3d where supported
  Browser.translateRule = function(x, y) {
    if (Browser.SUPPORTS_TRANSLATE3D) {
      return "translate3d(" + x + (x ? "px" : "") + "," + y + (y ? "px" : "") + ",0)";
    }
    return "translate(" + x + (x ? "px" : "") + "," + y + (y ? "px" : "") + ")";
  };

  Browser.CAPABLE_BROWSER = (function () {
    var is_too_small = false;
    // Our interface doesn't work on phone-size devices.
    if (window.matchMedia) {
    var mq = window.matchMedia("(max-device-width:480px)");
    if (mq && mq.matches) is_too_small = true;
    } else if (Browser.IS_ANDROID) {
    // Assume Android devices without matchMedia are too small.
    is_too_small = true;
    }

    var elem = document.createElement('canvas');
    var supports_canvas = !!(elem.getContext && elem.getContext('2d'));
    
    //we don't support iOS3 (which requires svg for fonts)
    var is_iOS3 = (Browser.IS_IPAD && (navigator.userAgent.match(/OS 3/i) !== null));

    return ((supports_canvas) && !(is_too_small || Browser.IS_KINDLE || is_iOS3 || Browser.IS_ANDROID));
  })();

  if (!Browser.CAPABLE_BROWSER) {
    alert("We haven't tested with this device & browser. It might work, but we make no promises! For best results, we recommend using Google Chrome on a computer or the iPad")
  }

  return Browser;
})();
