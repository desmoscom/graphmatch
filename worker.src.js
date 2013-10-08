
/**
 * almond 0.2.5 Copyright (c) 2011-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);

                name = baseParts.concat(name.split("/"));

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (typeof callback === 'function') {

            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback.apply(defined[name], args);

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        config = cfg;
        if (config.deps) {
            req(config.deps, config.callback);
        }
        return req;
    };

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("vendor/almond", function(){});

define('pjs',[], function() {
var P = (function(prototype, ownProperty, undefined) {
  // helper functions that also help minification
  function isObject(o) { return typeof o === 'object'; }
  function isFunction(f) { return typeof f === 'function'; }

  // used to extend the prototypes of superclasses (which might not
  // have `.Bare`s)
  function SuperclassBare() {}

  function P(_superclass /* = Object */, definition) {
    // handle the case where no superclass is given
    if (definition === undefined) {
      definition = _superclass;
      _superclass = Object;
    }

    // C is the class to be returned.
    //
    // It delegates to instantiating an instance of `Bare`, so that it
    // will always return a new instance regardless of the calling
    // context.
    //
    //  TODO: the Chrome inspector shows all created objects as `C`
    //        rather than `Object`.  Setting the .name property seems to
    //        have no effect.  Is there a way to override this behavior?
    function C() {
      var self = new Bare;
      if (isFunction(self.init)) self.init.apply(self, arguments);
      return self;
    }

    // C.Bare is a class with a noop constructor.  Its prototype is the
    // same as C, so that instances of C.Bare are also instances of C.
    // New objects can be allocated without initialization by calling
    // `new MyClass.Bare`.
    function Bare() {}
    C.Bare = Bare;

    // Set up the prototype of the new class.
    var _super = SuperclassBare[prototype] = _superclass[prototype];
    var proto = Bare[prototype] = C[prototype] = new SuperclassBare;

    // other variables, as a minifier optimization
    var extensions;


    // set the constructor property on the prototype, for convenience
    proto.constructor = C;

    C.mixin = function(def) {
      Bare[prototype] = C[prototype] = P(C, def)[prototype];
      return C;
    }

    return (C.open = function(def) {
      extensions = {};

      if (isFunction(def)) {
        // call the defining function with all the arguments you need
        // extensions captures the return value.
        extensions = def.call(C, proto, _super, C, _superclass);
      }
      else if (isObject(def)) {
        // if you passed an object instead, we'll take it
        extensions = def;
      }

      // ...and extend it
      if (isObject(extensions)) {
        for (var ext in extensions) {
          if (ownProperty.call(extensions, ext)) {
            proto[ext] = extensions[ext];
          }
        }
      }

      // if there's no init, we assume we're inheriting a non-pjs class, so
      // we default to applying the superclass's constructor.
      if (!isFunction(proto.init)) {
        proto.init = _superclass;
      }

      return C;
    })(definition);
  }

  // ship it
  return P;

  // as a minifier optimization, we've closured in a few helper functions
  // and the string 'prototype' (C[p] is much shorter than C.prototype)
})('prototype', ({}).hasOwnProperty);
return P;
});

//     Underscore.js 1.3.3
//     (c) 2009-2012 Jeremy Ashkenas, DocumentCloud Inc.
//     Underscore may be freely distributed under the MIT license.
//     Portions of Underscore are inspired or borrowed from Prototype,
//     Oliver Steele's Functional, and John Resig's Micro-Templating.
//     For all details and documentation:
//     http://documentcloud.github.com/underscore

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `global` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var slice            = ArrayProto.slice,
      unshift          = ArrayProto.unshift,
      toString         = ObjProto.toString,
      hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) { return new wrapper(obj); };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root['_'] = _;
  }

  // Current version.
  _.VERSION = '1.3.3';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, l = obj.length; i < l; i++) {
        if (i in obj && iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      for (var key in obj) {
        if (_.has(obj, key)) {
          if (iterator.call(context, obj[key], key, obj) === breaker) return;
        }
      }
    }
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results[results.length] = iterator.call(context, value, index, list);
    });
    if (obj.length === +obj.length) results.length = obj.length;
    return results;
  };

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError('Reduce of empty array with no initial value');
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var reversed = _.toArray(obj).reverse();
    if (context && !initial) iterator = _.bind(iterator, context);
    return initial ? _.reduce(reversed, iterator, memo, context) : _.reduce(reversed, iterator);
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, iterator, context) {
    var result;
    any(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);
    each(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    each(obj, function(value, index, list) {
      if (!iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, iterator, context) {
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);
    each(obj, function(value, index, list) {
      if (!(result = result && iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);
    each(obj, function(value, index, list) {
      if (result || (result = iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if a given value is included in the array or object using `===`.
  // Aliased as `contains`.
  _.include = _.contains = function(obj, target) {
    var found = false;
    if (obj == null) return found;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    found = any(obj, function(value) {
      return value === target;
    });
    return found;
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    return _.map(obj, function(value) {
      return (_.isFunction(method) ? method || value : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, function(value){ return value[key]; });
  };

  // Return the maximum element or (element-based computation).
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0]) return Math.max.apply(Math, obj);
    if (!iterator && _.isEmpty(obj)) return -Infinity;
    var result = {computed : -Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed >= result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0]) return Math.min.apply(Math, obj);
    if (!iterator && _.isEmpty(obj)) return Infinity;
    var result = {computed : Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed < result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Shuffle an array.
  _.shuffle = function(obj) {
    var shuffled = [], rand;
    each(obj, function(value, index, list) {
      rand = Math.floor(Math.random() * (index + 1));
      shuffled[index] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, val, context) {
    var iterator = _.isFunction(val) ? val : function(obj) { return obj[val]; };
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value : value,
        criteria : iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria, b = right.criteria;
      if (a === void 0) return 1;
      if (b === void 0) return -1;
      return a < b ? -1 : a > b ? 1 : 0;
    }), 'value');
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = function(obj, val) {
    var result = {};
    var iterator = _.isFunction(val) ? val : function(obj) { return obj[val]; };
    each(obj, function(value, index) {
      var key = iterator(value, index);
      (result[key] || (result[key] = [])).push(value);
    });
    return result;
  };

  // Use a comparator function to figure out at what index an object should
  // be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator) {
    iterator || (iterator = _.identity);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >> 1;
      iterator(array[mid]) < iterator(obj) ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely convert anything iterable into a real, live array.
  _.toArray = function(obj) {
    if (!obj)                                     return [];
    if (_.isArray(obj))                           return slice.call(obj);
    if (_.isArguments(obj))                       return slice.call(obj);
    if (obj.toArray && _.isFunction(obj.toArray)) return obj.toArray();
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    return _.isArray(obj) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    return (n != null) && !guard ? slice.call(array, 0, n) : array[0];
  };

  // Returns everything but the last entry of the array. Especcialy useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if ((n != null) && !guard) {
      return slice.call(array, Math.max(array.length - n, 0));
    } else {
      return array[array.length - 1];
    }
  };

  // Returns everything but the first entry of the array. Aliased as `tail`.
  // Especially useful on the arguments object. Passing an **index** will return
  // the rest of the values in the array from that index onward. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = function(array, index, guard) {
    return slice.call(array, (index == null) || guard ? 1 : index);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, function(value){ return !!value; });
  };

  // Return a completely flattened version of an array.
  _.flatten = function(array, shallow) {
    return _.reduce(array, function(memo, value) {
      if (_.isArray(value)) return memo.concat(shallow ? value : _.flatten(value));
      memo[memo.length] = value;
      return memo;
    }, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator) {
    var initial = iterator ? _.map(array, iterator) : array;
    var results = [];
    // The `isSorted` flag is irrelevant if the array only contains two elements.
    if (array.length < 3) isSorted = true;
    _.reduce(initial, function (memo, value, index) {
      if (isSorted ? _.last(memo) !== value || !memo.length : !_.include(memo, value)) {
        memo.push(value);
        results.push(array[index]);
      }
      return memo;
    }, []);
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays. (Aliased as "intersect" for back-compat.)
  _.intersection = _.intersect = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.indexOf(other, item) >= 0;
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = _.flatten(slice.call(arguments, 1), true);
    return _.filter(array, function(value){ return !_.include(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var args = slice.call(arguments);
    var length = _.max(_.pluck(args, 'length'));
    var results = new Array(length);
    for (var i = 0; i < length; i++) results[i] = _.pluck(args, "" + i);
    return results;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i, l;
    if (isSorted) {
      i = _.sortedIndex(array, item);
      return array[i] === item ? i : -1;
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item);
    for (i = 0, l = array.length; i < l; i++) if (i in array && array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item) {
    if (array == null) return -1;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) return array.lastIndexOf(item);
    var i = array.length;
    while (i--) if (i in array && array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var len = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(len);

    while(idx < len) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Binding with arguments is also known as `curry`.
  // Delegates to **ECMAScript 5**'s native `Function.bind` if available.
  // We check for `func.bind` first, to fail fast when `func` is undefined.
  _.bind = function bind(func, context) {
    var bound, args;
    if (func.bind === nativeBind && nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Bind all of an object's methods to that object. Useful for ensuring that
  // all callbacks defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length == 0) funcs = _.functions(obj);
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time.
  _.throttle = function(func, wait) {
    var context, args, timeout, throttling, more, result;
    var whenDone = _.debounce(function(){ more = throttling = false; }, wait);
    return function() {
      context = this; args = arguments;
      var later = function() {
        timeout = null;
        if (more) func.apply(context, args);
        whenDone();
      };
      if (!timeout) timeout = setTimeout(later, wait);
      if (throttling) {
        more = true;
      } else {
        result = func.apply(context, args);
      }
      whenDone();
      throttling = true;
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      if (immediate && !timeout) func.apply(context, args);
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      return memo = func.apply(this, arguments);
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return function() {
      var args = [func].concat(slice.call(arguments, 0));
      return wrapper.apply(this, args);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    if (times <= 0) return func();
    return function() {
      if (--times < 1) { return func.apply(this, arguments); }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = nativeKeys || function(obj) {
    if (obj !== Object(obj)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys[keys.length] = key;
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    return _.map(obj, _.identity);
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      for (var prop in source) {
        obj[prop] = source[prop];
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var result = {};
    each(_.flatten(slice.call(arguments, 1)), function(key) {
      if (key in obj) result[key] = obj[key];
    });
    return result;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      for (var prop in source) {
        if (obj[prop] == null) obj[prop] = source[prop];
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function.
  function eq(a, b, stack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the Harmony `egal` proposal: http://wiki.ecmascript.org/doku.php?id=harmony:egal.
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a._chain) a = a._wrapped;
    if (b._chain) b = b._wrapped;
    // Invoke a custom `isEqual` method if one is provided.
    if (a.isEqual && _.isFunction(a.isEqual)) return a.isEqual(b);
    if (b.isEqual && _.isFunction(b.isEqual)) return b.isEqual(a);
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = stack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (stack[length] == a) return true;
    }
    // Add the first object to the stack of traversed objects.
    stack.push(a);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          // Ensure commutative equality for sparse arrays.
          if (!(result = size in a == size in b && eq(a[size], b[size], stack))) break;
        }
      }
    } else {
      // Objects with different constructors are not equivalent.
      if ('constructor' in a != 'constructor' in b || a.constructor != b.constructor) return false;
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], stack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    stack.pop();
    return result;
  }

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType == 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Is a given variable an arguments object?
  _.isArguments = function(obj) {
    return toString.call(obj) == '[object Arguments]';
  };
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Is a given value a function?
  _.isFunction = function(obj) {
    return toString.call(obj) == '[object Function]';
  };

  // Is a given value a string?
  _.isString = function(obj) {
    return toString.call(obj) == '[object String]';
  };

  // Is a given value a number?
  _.isNumber = function(obj) {
    return toString.call(obj) == '[object Number]';
  };

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return _.isNumber(obj) && isFinite(obj);
  };

  // Is the given value `NaN`?
  _.isNaN = function(obj) {
    // `NaN` is the only value for which `===` is not reflexive.
    return obj !== obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value a date?
  _.isDate = function(obj) {
    return toString.call(obj) == '[object Date]';
  };

  // Is the given value a regular expression?
  _.isRegExp = function(obj) {
    return toString.call(obj) == '[object RegExp]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Has own property?
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  // Run a function **n** times.
  _.times = function (n, iterator, context) {
    for (var i = 0; i < n; i++) iterator.call(context, i);
  };

  // Escape a string for HTML interpolation.
  _.escape = function(string) {
    return (''+string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g,'&#x2F;');
  };

  // If the value of the named property is a function then invoke it;
  // otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return null;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object, ensuring that
  // they're correctly added to the OOP wrapper as well.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name){
      addToWrapper(name, _[name] = obj[name]);
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = idCounter++;
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /.^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    '\\': '\\',
    "'": "'",
    'r': '\r',
    'n': '\n',
    't': '\t',
    'u2028': '\u2028',
    'u2029': '\u2029'
  };

  for (var p in escapes) escapes[escapes[p]] = p;
  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;
  var unescaper = /\\(\\|'|r|n|t|u2028|u2029)/g;

  // Within an interpolation, evaluation, or escaping, remove HTML escaping
  // that had been previously added.
  var unescape = function(code) {
    return code.replace(unescaper, function(match, escape) {
      return escapes[escape];
    });
  };

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    settings = _.defaults(settings || {}, _.templateSettings);

    // Compile the template source, taking care to escape characters that
    // cannot be included in a string literal and then unescape them in code
    // blocks.
    var source = "__p+='" + text
      .replace(escaper, function(match) {
        return '\\' + escapes[match];
      })
      .replace(settings.escape || noMatch, function(match, code) {
        return "'+\n_.escape(" + unescape(code) + ")+\n'";
      })
      .replace(settings.interpolate || noMatch, function(match, code) {
        return "'+\n(" + unescape(code) + ")+\n'";
      })
      .replace(settings.evaluate || noMatch, function(match, code) {
        return "';\n" + unescape(code) + "\n;__p+='";
      }) + "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __p='';" +
      "var print=function(){__p+=Array.prototype.join.call(arguments, '')};\n" +
      source + "return __p;\n";

    var render = new Function(settings.variable || 'obj', '_', source);
    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for build time
    // precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' +
      source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // The OOP Wrapper
  // ---------------

  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.
  var wrapper = function(obj) { this._wrapped = obj; };

  // Expose `wrapper.prototype` as `_.prototype`
  _.prototype = wrapper.prototype;

  // Helper function to continue chaining intermediate results.
  var result = function(obj, chain) {
    return chain ? _(obj).chain() : obj;
  };

  // A method to easily add functions to the OOP wrapper.
  var addToWrapper = function(name, func) {
    wrapper.prototype[name] = function() {
      var args = slice.call(arguments);
      unshift.call(args, this._wrapped);
      return result(func.apply(_, args), this._chain);
    };
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    wrapper.prototype[name] = function() {
      var wrapped = this._wrapped;
      method.apply(wrapped, arguments);
      var length = wrapped.length;
      if ((name == 'shift' || name == 'splice') && length === 0) delete wrapped[0];
      return result(wrapped, this._chain);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    wrapper.prototype[name] = function() {
      return result(method.apply(this._wrapped, arguments), this._chain);
    };
  });

  // Start chaining a wrapped Underscore object.
  wrapper.prototype.chain = function() {
    this._chain = true;
    return this;
  };

  // Extracts the result from a wrapped and chained object.
  wrapper.prototype.value = function() {
    return this._wrapped;
  };

}).call(this);
define("underscore", (function (global) {
    return function () {
        var ret, fn;
        return ret || global._;
    };
}(this)));

//Definition of built-in functions and variables

define('math/builtin',['require'],function(require){

var BuiltIn = {};

BuiltIn.mod = function(a, b){
  return a - b * Math.floor(a/b);
};

BuiltIn.min = function(a, b){
  return (a < b) ? a : b;
};

BuiltIn.max = function(a, b){
  return (a > b) ? a : b;
};

BuiltIn.sign = function(x){
  if(x === 0) return 0;
  if(x > 0) return 1;
  if(x < 0) return -1;
  return NaN;
};

BuiltIn.lcm = function(a, b){
  a = BuiltIn.smartTruncate(a);
  b = BuiltIn.smartTruncate(b);
  var gcd = BuiltIn.getGCD(a, b);
  return Math.abs(a * b / gcd);
};

BuiltIn.gcd = function(a, b){
  return BuiltIn.getGCD(a, b);
};

BuiltIn.nCr = function(n, r){
  n = BuiltIn.smartTruncate(n);
  r = BuiltIn.smartTruncate(r);
  
  //Error conditions
  if(r > n || n < 0 || r < 0){
    return 0;
  }

  var total = 1;
  for(var i = 0; i < r; i++)
  {
    total *= (n - i) / (i + 1);
  }
  return total;
};

BuiltIn.nPr = function(n, r){
  n = BuiltIn.smartTruncate(n);
  r = BuiltIn.smartTruncate(r);

  //Error conditions
  if(r > n || n < 0 || r < 0){
    return 0;
  }

  var total = 1;
  for(var i = 0; i < r; i++){
    total *= (n-i);
  }
  return total;
};

BuiltIn.factorial = function (x) {
  return BuiltIn.gamma(x + 1);
};

BuiltIn._integerFactorial = function (n) {
  if (n !== Math.floor(n)) return NaN;
  if (n < 0) return NaN;
  if (n > 170) return NaN; // Overflows double point floats
  if (n === 0 || n === 1) return 1;

  var output = 1;
  for (var i = 2; i <= n; i++) output *= i;

  return output;
};

BuiltIn.gamma = function (x) {
  if (x === Math.floor(x)) return BuiltIn._integerFactorial(x - 1);
  // Euler's reflection formula
  if (x < 0) return Math.PI/(Math.sin(Math.PI*x)*BuiltIn.gamma(1-x));
  return Math.exp(BuiltIn.lnGamma(x));
};

BuiltIn.lnGamma = function (x) {
  if (x < 0) return NaN; // Alternates between real and complex on integers.

  // 15 term rational approximation of lnGamma, valid for positive numbers.
  // Original source not known, but verified by JM using Mathematica to give
  // at least 14 correct digits of gamma = Math.exp(Math.lnGamma(x)) for
  // integers and half integers between 0 and 60, and at least 12 correct
  // digits up to 170.
  var cof = [
    57.1562356658629235,
    -59.5979603554754912,
    14.1360979747417471,
    -0.491913816097620199,
    0.339946499848118887e-4,
    0.465236289270485756e-4,
    -0.983744753048795646e-4,
    0.158088703224912494e-3,
    -0.210264441724104883e-3,
    0.217439618115212643e-3,
    -0.164318106536763890e-3,
    0.844182239838527433e-4,
    -0.261908384015814087e-4,
    0.368991826595316234e-5
  ];

  var s = 0.999999999999997092;
  for (var i=0; i < 14; i++) s += cof[i]/(x + i + 1);

  var t = x + 5.24218750000000000;

  return (x + 0.5)*Math.log(t) - t + Math.log(2.5066282746310005*s/x);
};

// BernoulliB_{2k} for k=1..14
BuiltIn.bernoulliTable = [
  1/6, -1/30, 1/42, -1/30, 5/66, -691/2730, 7/6, -3617/510,
  43867/798, -174611/330, 854513/138, -236364091/2730, 8553103/6,
  -23749461029/870
];

// mth derivative of cot(x)
//
// Used in evaluating reflection formula for polygamma
//
// Uses fact that (d/dx)^m cot(x) = p_m(cos(x))/sin(x)^{m+1} where p_m(x) is a
// polynomial with coefficents that obey the following recursion relation:
//
// a_{m+1, n} = -((m - n + 2) a_{m, n-1} + (n+1) a_{m, n+1})
//            = -(            t1         +        t2       )
// a_{0, 0} = 0, a_{0, 1} = 1
//
// Could improve performance by taking advantage of fact that p is even/odd
// when m is odd/even. Didn't feel worth the added trickiness.
BuiltIn.cotDerivative = function(m, x) {
  if (m !== Math.floor(m)) return NaN;
  if (m < 0) return NaN;

  if (m === 0) return 1/BuiltIn.tan(x);

  var sinx = BuiltIn.sin(x);
  if (m === 1) return -1/(sinx*sinx);

  var cosx = BuiltIn.cos(x);
  if (m === 2) return 2*cosx/(sinx*sinx*sinx);

  var aprev = [0, 2];
  var a;
  var mp, n;
  var t1, t2;
  for (mp = 3; mp <= m; mp++) {
    a = [];
    for (n = 0; n < mp; n++) {
      t1 = 0;
      t2 = 0;
      if (n > 0) t1 = (mp - n + 1)*aprev[n - 1];
      if (n + 2 < mp) t2 = (n + 1)*aprev[n + 1];
      a.push(-(t1 + t2));
    }
    aprev = a;
  }

  var s = 0;
  // Horner's method for polynomial evaluation
  for (n = m - 1; n >= 0; n--) s = a[n] + cosx*s;

  return s/Math.pow(sinx, m + 1);
};

// polyGamma(m, n) is the (m+1)th derivative of lnGamma(n)
//
// Implemented by differentiating Stirling's approximation:
//
// d/dn ln(Gamma(n)) = -\left(
//         ln(n) + 1/2n + \sum_{k=1}^{\infty} B_{2k}/(2k n^{2k})
//       /right)
//
// d^{m+1}/dn^{m+1} ln(Gamma(n)) =
//      m! (-1)^{m + 1} \left(
//        1/(m n^m) - 1/(2 n^{1+m}) +
//        \sum_{k=1}^{\infty} B_{2k} (2k + m - 1)!/(m!(2k)!n^{2k+m})
//      \right)
//
// B_{2k} are the Bernoulli numbers.
//
// Uses recurrence relation to bring arguments above 10, and reflection
// formula for negative n. In this case, 14 term sum gives results accurate to
// machine precision for values of m between 0 and at least 8.
//
// Only get 8 digits for polyGamma(100, 30)
//
// Recurrence relation:
//
// polyGamma(m, n) = polyGamma(m, n + 1) + (-1)^m m!/n^{m+1}
//
// Reflection formula:
//
// polyGamma(m, n) = (-1)^{m}polyGamma(m, 1 - n) - pi d^m/dn^m cot(pi*n)
//
// Can lose some accuracy in reflection formula for large m because of large
// powers of trig functions.
BuiltIn.polyGamma = function (m, n) {
  if (m < 0) return NaN;
  if (m !== Math.floor(m)) return NaN;
  var sign = (m % 2 === 0) ? -1 : 1;
  // Use reflection formula for negative n
  if (n < 0) {
    return -sign*BuiltIn.polyGamma(m, 1 - n) -
      Math.pow(Math.PI, m + 1)*BuiltIn.cotDerivative(m, Math.PI*n);
  }

  var mfac = BuiltIn.factorial(m);

  // Use recurrence relation to bring n above 10
  var s = 0;
  var npmm = Math.pow(n, -(m + 1));
  while (n < 10) {
    s += npmm;
    n++;
    npmm = Math.pow(n, -(m + 1));
  }

  s += (m === 0) ? -Math.log(n) : npmm*n/m;
  s += 0.5*npmm;

  var bt = BuiltIn.bernoulliTable;
  var num = m + 1;
  var denom = 2;
  var pre = npmm*n*num/denom;
  var nsqinv = 1/(n*n);
  for (var k = 1; k <= 14; k++) {
    pre *= nsqinv;
    s += pre*bt[k-1];
    num++; denom++;
    pre *= num/denom;
    num++; denom++;
    pre *= num/denom;
  }
  return mfac*sign*s;
};

BuiltIn.getGCD = function(x,y)
{
    //Only defined over integers
    var a = BuiltIn.smartTruncate(x);
    var b = BuiltIn.smartTruncate(y);

    // Positive values only
    if (a < 0)
        a = -a;
    if (b < 0)
        b = -b;

    // Reverse order if necessary.
    // b should be smaller than a
    if (b > a)
    {
        var temp = b;
        b = a;
        a = temp;
    }

    //GCD(0, x) = x
    if(b === 0){
      return a;
    }
    
    var m = a % b;
    
    while (m > 0)
    {
        a = b;
        b = m;
        m = a % b;
    }
    
    return b;
};

// Returns a reduced fraction approximation of x with denominator less than
// maxDenominator. maxDenominator defaults to 1e6.
BuiltIn.toFraction = function (x, maxDenominator) {
  
  if (x === Infinity) return { n: Infinity, d: 1 };
  if (x === -Infinity) return { n: -Infinity, d: 1};
  if (!isFinite(x)) return { n: NaN, d: 1};
  
  var whole, n0 = 0, n1 = 1, d0 = 1, d1 = 0, n, d;
  if (!maxDenominator) maxDenominator = 1e6;
  while (true) {
    whole = Math.floor(x);
    n = whole*n1 + n0;
    d = whole*d1 + d0;
    if (d > maxDenominator) break;
    n0 = n1;
    d0 = d1;
    n1 = n;
    d1 = d;
    if (x === whole) break;
    x = 1/(x - whole);
  }
  return { n: n1, d: d1 };
};

// Check if two values are equal to within the given number of bits of
// precision. For numbers smaller than one, compares the difference in the
// numbers to 1 instead of the larger of the numbers. This makes calculations like
// BuiltIn.approx(Math.sin(Math.Pi), 0) work out.
BuiltIn.approx = function (x1, x2, bits) {
  var m = Math.max(Math.max(Math.abs(x1), Math.abs(x2)), 1);
  var d = (bits === undefined) ? 0.5 : Math.pow(0.5, bits);
  return m === m + d*Math.abs(x2 - x1);
};

BuiltIn.smartTruncate = function(x){
  if (x < 0){
    return Math.ceil(x);
  } else {
    return Math.floor(x);
  }
};

BuiltIn.log_base = function(n, base){return Math.log(n) / Math.log(base)};

BuiltIn.pow = function (x, n) {
  if (x >= 0 || n === Math.floor(n)) return Math.pow(x, n);
  var frac = BuiltIn.toFraction(n, 100);
  if (BuiltIn.approx(frac.n/frac.d, n, 2) && frac.d % 2 === 1) return (frac.n % 2 === 0 ? 1 : -1) * Math.pow(-x, n);
  return NaN;
};
BuiltIn.nthroot = function(x, n) { return BuiltIn.pow(x, 1/n) };

var PI_INV = 1/Math.PI;

//Trig functions
BuiltIn.sin = function (x) {
  if (2*PI_INV*x % 2 === 0) return 0;
  return Math.sin(x);
};

BuiltIn.cos = function (x) {
  if (Math.abs(2*PI_INV*x % 2) === 1) return 0;
  return Math.cos(x);
};

BuiltIn.tan = function (x) {
  if (2*PI_INV*x % 2 === 0) return 0;
  if (Math.abs(2*PI_INV*x % 2) === 1) return Infinity;
  return Math.tan(x);
};

BuiltIn.sec = function (x) {
  if (Math.abs(2*PI_INV*x % 2) === 1) return Infinity;
  return 1/Math.cos(x);
};

BuiltIn.csc = function(x) {
  if (2*PI_INV*x % 2 === 0) return Infinity;
  return 1/Math.sin(x);
};

BuiltIn.cot = function(x) {
  if (2*PI_INV*x % 2 === 0) return Infinity;
  if (Math.abs(2*PI_INV*x % 2) === 1) return 0;
  return 1/Math.tan(x);
};

//Inverse trig functions
BuiltIn.acot = function(x){return Math.PI / 2 - Math.atan(x)};
BuiltIn.acsc = function(x){return Math.asin(1/x)};
BuiltIn.asec = function(x){return Math.acos(1/x)};

//Hyperbolic trig functions
BuiltIn.sinh = function(x){return (Math.exp(x) - Math.exp(-x)) / 2};
BuiltIn.cosh = function(x){return (Math.exp(x) + Math.exp(-x)) / 2};
BuiltIn.tanh = function(x) {
  // This definition avoids overflow of sinh and cosh for large x
  if (x > 0) {
    return (1 - Math.exp(-2*x))/(1 + Math.exp(-2*x));
  } else {
    return (Math.exp(2*x) - 1)/(Math.exp(2*x) + 1);
  }
};

BuiltIn.sech = function(x){return 1 / BuiltIn.cosh(x)};
BuiltIn.csch = function(x){return 1 / BuiltIn.sinh(x)};
BuiltIn.coth = function(x){return 1 / BuiltIn.tanh(x)};

//Inverse hyperbolic trig functions
BuiltIn.asinh = function(x){return Math.log(x+Math.sqrt(x*x+1))};
BuiltIn.acosh = function(x){return Math.log(x+Math.sqrt(x+1)*Math.sqrt(x-1))};
BuiltIn.atanh = function(x){return 0.5 * Math.log((1+x)/(1-x))};

BuiltIn.asech = function(x){return Math.log(1/x + Math.sqrt((1/x + 1)) * Math.sqrt((1/x - 1)))};
BuiltIn.acsch = function(x){return Math.log(1/x + Math.sqrt((1/(x*x)+1)))};
BuiltIn.acoth = function(x){return 0.5 * Math.log((x+1)/(x-1))};

return BuiltIn;
});

define('numeric',[],function () {


var numeric = (typeof exports === "undefined")?(function numeric() {}):(exports);
if(typeof global !== "undefined") { global.numeric = numeric; }

numeric.version = "1.2.6";

// 1. Utility functions
numeric.bench = function bench (f,interval) {
    var t1,t2,n,i;
    if(typeof interval === "undefined") { interval = 15; }
    n = 0.5;
    t1 = new Date();
    while(1) {
        n*=2;
        for(i=n;i>3;i-=4) { f(); f(); f(); f(); }
        while(i>0) { f(); i--; }
        t2 = new Date();
        if(t2-t1 > interval) break;
    }
    for(i=n;i>3;i-=4) { f(); f(); f(); f(); }
    while(i>0) { f(); i--; }
    t2 = new Date();
    return 1000*(3*n-1)/(t2-t1);
}

numeric._myIndexOf = (function _myIndexOf(w) {
    var n = this.length,k;
    for(k=0;k<n;++k) if(this[k]===w) return k;
    return -1;
});
numeric.myIndexOf = (Array.prototype.indexOf)?Array.prototype.indexOf:numeric._myIndexOf;

numeric.precision = 4;
numeric.largeArray = 50;

// Wrapper around `new Function` that closures in the `numeric` object.
numeric.compile = function () {
  var args = Array.prototype.slice.call(arguments);
  var body = args.pop();
  body = 'return function (' + args.join(',') + ') {' + body + ';}';
  return (new Function(['numeric'], body))(numeric);
}

numeric.prettyPrint = function prettyPrint(x) {
    function fmtnum(x) {
        if(x === 0) { return '0'; }
        if(isNaN(x)) { return 'NaN'; }
        if(x<0) { return '-'+fmtnum(-x); }
        if(isFinite(x)) {
            var scale = Math.floor(Math.log(x) / Math.log(10));
            var normalized = x / Math.pow(10,scale);
            var basic = normalized.toPrecision(numeric.precision);
            if(parseFloat(basic) === 10) { scale++; normalized = 1; basic = normalized.toPrecision(numeric.precision); }
            return parseFloat(basic).toString()+'e'+scale.toString();
        }
        return 'Infinity';
    }
    var ret = [];
    function foo(x) {
        var k;
        if(typeof x === "undefined") { ret.push(Array(numeric.precision+8).join(' ')); return false; }
        if(typeof x === "string") { ret.push('"'+x+'"'); return false; }
        if(typeof x === "boolean") { ret.push(x.toString()); return false; }
        if(typeof x === "number") {
            var a = fmtnum(x);
            var b = x.toPrecision(numeric.precision);
            var c = parseFloat(x.toString()).toString();
            var d = [a,b,c,parseFloat(b).toString(),parseFloat(c).toString()];
            for(k=1;k<d.length;k++) { if(d[k].length < a.length) a = d[k]; }
            ret.push(Array(numeric.precision+8-a.length).join(' ')+a);
            return false;
        }
        if(x === null) { ret.push("null"); return false; }
        if(typeof x === "function") { 
            ret.push(x.toString());
            var flag = false;
            for(k in x) { if(x.hasOwnProperty(k)) { 
                if(flag) ret.push(',\n');
                else ret.push('\n{');
                flag = true; 
                ret.push(k); 
                ret.push(': \n'); 
                foo(x[k]); 
            } }
            if(flag) ret.push('}\n');
            return true;
        }
        if(x instanceof Array) {
            if(x.length > numeric.largeArray) { ret.push('...Large Array...'); return true; }
            var flag = false;
            ret.push('[');
            for(k=0;k<x.length;k++) { if(k>0) { ret.push(','); if(flag) ret.push('\n '); } flag = foo(x[k]); }
            ret.push(']');
            return true;
        }
        ret.push('{');
        var flag = false;
        for(k in x) { if(x.hasOwnProperty(k)) { if(flag) ret.push(',\n'); flag = true; ret.push(k); ret.push(': \n'); foo(x[k]); } }
        ret.push('}');
        return true;
    }
    foo(x);
    return ret.join('');
}

numeric.parseDate = function parseDate(d) {
    function foo(d) {
        if(typeof d === 'string') { return Date.parse(d.replace(/-/g,'/')); }
        if(!(d instanceof Array)) { throw new Error("parseDate: parameter must be arrays of strings"); }
        var ret = [],k;
        for(k=0;k<d.length;k++) { ret[k] = foo(d[k]); }
        return ret;
    }
    return foo(d);
}

numeric.parseFloat = function parseFloat_(d) {
    function foo(d) {
        if(typeof d === 'string') { return parseFloat(d); }
        if(!(d instanceof Array)) { throw new Error("parseFloat: parameter must be arrays of strings"); }
        var ret = [],k;
        for(k=0;k<d.length;k++) { ret[k] = foo(d[k]); }
        return ret;
    }
    return foo(d);
}

numeric.parseCSV = function parseCSV(t) {
    var foo = t.split('\n');
    var j,k;
    var ret = [];
    var pat = /(([^'",]*)|('[^']*')|("[^"]*")),/g;
    var patnum = /^\s*(([+-]?[0-9]+(\.[0-9]*)?(e[+-]?[0-9]+)?)|([+-]?[0-9]*(\.[0-9]+)?(e[+-]?[0-9]+)?))\s*$/;
    var stripper = function(n) { return n.substr(0,n.length-1); }
    var count = 0;
    for(k=0;k<foo.length;k++) {
      var bar = (foo[k]+",").match(pat),baz;
      if(bar.length>0) {
          ret[count] = [];
          for(j=0;j<bar.length;j++) {
              baz = stripper(bar[j]);
              if(patnum.test(baz)) { ret[count][j] = parseFloat(baz); }
              else ret[count][j] = baz;
          }
          count++;
      }
    }
    return ret;
}

numeric.toCSV = function toCSV(A) {
    var s = numeric.dim(A);
    var i,j,m,n,row,ret;
    m = s[0];
    n = s[1];
    ret = [];
    for(i=0;i<m;i++) {
        row = [];
        for(j=0;j<m;j++) { row[j] = A[i][j].toString(); }
        ret[i] = row.join(', ');
    }
    return ret.join('\n')+'\n';
}

numeric.getURL = function getURL(url) {
    var client = new XMLHttpRequest();
    client.open("GET",url,false);
    client.send();
    return client;
}

numeric.imageURL = function imageURL(img) {
    function base64(A) {
        var n = A.length, i,x,y,z,p,q,r,s;
        var key = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        var ret = "";
        for(i=0;i<n;i+=3) {
            x = A[i];
            y = A[i+1];
            z = A[i+2];
            p = x >> 2;
            q = ((x & 3) << 4) + (y >> 4);
            r = ((y & 15) << 2) + (z >> 6);
            s = z & 63;
            if(i+1>=n) { r = s = 64; }
            else if(i+2>=n) { s = 64; }
            ret += key.charAt(p) + key.charAt(q) + key.charAt(r) + key.charAt(s);
            }
        return ret;
    }
    function crc32Array (a,from,to) {
        if(typeof from === "undefined") { from = 0; }
        if(typeof to === "undefined") { to = a.length; }
        var table = [0x00000000, 0x77073096, 0xEE0E612C, 0x990951BA, 0x076DC419, 0x706AF48F, 0xE963A535, 0x9E6495A3,
                     0x0EDB8832, 0x79DCB8A4, 0xE0D5E91E, 0x97D2D988, 0x09B64C2B, 0x7EB17CBD, 0xE7B82D07, 0x90BF1D91, 
                     0x1DB71064, 0x6AB020F2, 0xF3B97148, 0x84BE41DE, 0x1ADAD47D, 0x6DDDE4EB, 0xF4D4B551, 0x83D385C7,
                     0x136C9856, 0x646BA8C0, 0xFD62F97A, 0x8A65C9EC, 0x14015C4F, 0x63066CD9, 0xFA0F3D63, 0x8D080DF5, 
                     0x3B6E20C8, 0x4C69105E, 0xD56041E4, 0xA2677172, 0x3C03E4D1, 0x4B04D447, 0xD20D85FD, 0xA50AB56B, 
                     0x35B5A8FA, 0x42B2986C, 0xDBBBC9D6, 0xACBCF940, 0x32D86CE3, 0x45DF5C75, 0xDCD60DCF, 0xABD13D59, 
                     0x26D930AC, 0x51DE003A, 0xC8D75180, 0xBFD06116, 0x21B4F4B5, 0x56B3C423, 0xCFBA9599, 0xB8BDA50F,
                     0x2802B89E, 0x5F058808, 0xC60CD9B2, 0xB10BE924, 0x2F6F7C87, 0x58684C11, 0xC1611DAB, 0xB6662D3D,
                     0x76DC4190, 0x01DB7106, 0x98D220BC, 0xEFD5102A, 0x71B18589, 0x06B6B51F, 0x9FBFE4A5, 0xE8B8D433,
                     0x7807C9A2, 0x0F00F934, 0x9609A88E, 0xE10E9818, 0x7F6A0DBB, 0x086D3D2D, 0x91646C97, 0xE6635C01, 
                     0x6B6B51F4, 0x1C6C6162, 0x856530D8, 0xF262004E, 0x6C0695ED, 0x1B01A57B, 0x8208F4C1, 0xF50FC457, 
                     0x65B0D9C6, 0x12B7E950, 0x8BBEB8EA, 0xFCB9887C, 0x62DD1DDF, 0x15DA2D49, 0x8CD37CF3, 0xFBD44C65, 
                     0x4DB26158, 0x3AB551CE, 0xA3BC0074, 0xD4BB30E2, 0x4ADFA541, 0x3DD895D7, 0xA4D1C46D, 0xD3D6F4FB, 
                     0x4369E96A, 0x346ED9FC, 0xAD678846, 0xDA60B8D0, 0x44042D73, 0x33031DE5, 0xAA0A4C5F, 0xDD0D7CC9, 
                     0x5005713C, 0x270241AA, 0xBE0B1010, 0xC90C2086, 0x5768B525, 0x206F85B3, 0xB966D409, 0xCE61E49F, 
                     0x5EDEF90E, 0x29D9C998, 0xB0D09822, 0xC7D7A8B4, 0x59B33D17, 0x2EB40D81, 0xB7BD5C3B, 0xC0BA6CAD, 
                     0xEDB88320, 0x9ABFB3B6, 0x03B6E20C, 0x74B1D29A, 0xEAD54739, 0x9DD277AF, 0x04DB2615, 0x73DC1683, 
                     0xE3630B12, 0x94643B84, 0x0D6D6A3E, 0x7A6A5AA8, 0xE40ECF0B, 0x9309FF9D, 0x0A00AE27, 0x7D079EB1, 
                     0xF00F9344, 0x8708A3D2, 0x1E01F268, 0x6906C2FE, 0xF762575D, 0x806567CB, 0x196C3671, 0x6E6B06E7, 
                     0xFED41B76, 0x89D32BE0, 0x10DA7A5A, 0x67DD4ACC, 0xF9B9DF6F, 0x8EBEEFF9, 0x17B7BE43, 0x60B08ED5, 
                     0xD6D6A3E8, 0xA1D1937E, 0x38D8C2C4, 0x4FDFF252, 0xD1BB67F1, 0xA6BC5767, 0x3FB506DD, 0x48B2364B, 
                     0xD80D2BDA, 0xAF0A1B4C, 0x36034AF6, 0x41047A60, 0xDF60EFC3, 0xA867DF55, 0x316E8EEF, 0x4669BE79, 
                     0xCB61B38C, 0xBC66831A, 0x256FD2A0, 0x5268E236, 0xCC0C7795, 0xBB0B4703, 0x220216B9, 0x5505262F, 
                     0xC5BA3BBE, 0xB2BD0B28, 0x2BB45A92, 0x5CB36A04, 0xC2D7FFA7, 0xB5D0CF31, 0x2CD99E8B, 0x5BDEAE1D, 
                     0x9B64C2B0, 0xEC63F226, 0x756AA39C, 0x026D930A, 0x9C0906A9, 0xEB0E363F, 0x72076785, 0x05005713, 
                     0x95BF4A82, 0xE2B87A14, 0x7BB12BAE, 0x0CB61B38, 0x92D28E9B, 0xE5D5BE0D, 0x7CDCEFB7, 0x0BDBDF21, 
                     0x86D3D2D4, 0xF1D4E242, 0x68DDB3F8, 0x1FDA836E, 0x81BE16CD, 0xF6B9265B, 0x6FB077E1, 0x18B74777, 
                     0x88085AE6, 0xFF0F6A70, 0x66063BCA, 0x11010B5C, 0x8F659EFF, 0xF862AE69, 0x616BFFD3, 0x166CCF45, 
                     0xA00AE278, 0xD70DD2EE, 0x4E048354, 0x3903B3C2, 0xA7672661, 0xD06016F7, 0x4969474D, 0x3E6E77DB, 
                     0xAED16A4A, 0xD9D65ADC, 0x40DF0B66, 0x37D83BF0, 0xA9BCAE53, 0xDEBB9EC5, 0x47B2CF7F, 0x30B5FFE9, 
                     0xBDBDF21C, 0xCABAC28A, 0x53B39330, 0x24B4A3A6, 0xBAD03605, 0xCDD70693, 0x54DE5729, 0x23D967BF, 
                     0xB3667A2E, 0xC4614AB8, 0x5D681B02, 0x2A6F2B94, 0xB40BBE37, 0xC30C8EA1, 0x5A05DF1B, 0x2D02EF8D];
     
        var crc = -1, y = 0, n = a.length,i;

        for (i = from; i < to; i++) {
            y = (crc ^ a[i]) & 0xFF;
            crc = (crc >>> 8) ^ table[y];
        }
     
        return crc ^ (-1);
    }

    var h = img[0].length, w = img[0][0].length, s1, s2, next,k,length,a,b,i,j,adler32,crc32;
    var stream = [
                  137, 80, 78, 71, 13, 10, 26, 10,                           //  0: PNG signature
                  0,0,0,13,                                                  //  8: IHDR Chunk length
                  73, 72, 68, 82,                                            // 12: "IHDR" 
                  (w >> 24) & 255, (w >> 16) & 255, (w >> 8) & 255, w&255,   // 16: Width
                  (h >> 24) & 255, (h >> 16) & 255, (h >> 8) & 255, h&255,   // 20: Height
                  8,                                                         // 24: bit depth
                  2,                                                         // 25: RGB
                  0,                                                         // 26: deflate
                  0,                                                         // 27: no filter
                  0,                                                         // 28: no interlace
                  -1,-2,-3,-4,                                               // 29: CRC
                  -5,-6,-7,-8,                                               // 33: IDAT Chunk length
                  73, 68, 65, 84,                                            // 37: "IDAT"
                  // RFC 1950 header starts here
                  8,                                                         // 41: RFC1950 CMF
                  29                                                         // 42: RFC1950 FLG
                  ];
    crc32 = crc32Array(stream,12,29);
    stream[29] = (crc32>>24)&255;
    stream[30] = (crc32>>16)&255;
    stream[31] = (crc32>>8)&255;
    stream[32] = (crc32)&255;
    s1 = 1;
    s2 = 0;
    for(i=0;i<h;i++) {
        if(i<h-1) { stream.push(0); }
        else { stream.push(1); }
        a = (3*w+1+(i===0))&255; b = ((3*w+1+(i===0))>>8)&255;
        stream.push(a); stream.push(b);
        stream.push((~a)&255); stream.push((~b)&255);
        if(i===0) stream.push(0);
        for(j=0;j<w;j++) {
            for(k=0;k<3;k++) {
                a = img[k][i][j];
                if(a>255) a = 255;
                else if(a<0) a=0;
                else a = Math.round(a);
                s1 = (s1 + a )%65521;
                s2 = (s2 + s1)%65521;
                stream.push(a);
            }
        }
        stream.push(0);
    }
    adler32 = (s2<<16)+s1;
    stream.push((adler32>>24)&255);
    stream.push((adler32>>16)&255);
    stream.push((adler32>>8)&255);
    stream.push((adler32)&255);
    length = stream.length - 41;
    stream[33] = (length>>24)&255;
    stream[34] = (length>>16)&255;
    stream[35] = (length>>8)&255;
    stream[36] = (length)&255;
    crc32 = crc32Array(stream,37);
    stream.push((crc32>>24)&255);
    stream.push((crc32>>16)&255);
    stream.push((crc32>>8)&255);
    stream.push((crc32)&255);
    stream.push(0);
    stream.push(0);
    stream.push(0);
    stream.push(0);
//    a = stream.length;
    stream.push(73);  // I
    stream.push(69);  // E
    stream.push(78);  // N
    stream.push(68);  // D
    stream.push(174); // CRC1
    stream.push(66);  // CRC2
    stream.push(96);  // CRC3
    stream.push(130); // CRC4
    return 'data:image/png;base64,'+base64(stream);
}

// 2. Linear algebra with Arrays.
numeric._dim = function _dim(x) {
    var ret = [];
    while(typeof x === "object") { ret.push(x.length); x = x[0]; }
    return ret;
}

numeric.dim = function dim(x) {
    var y,z;
    if(typeof x === "object") {
        y = x[0];
        if(typeof y === "object") {
            z = y[0];
            if(typeof z === "object") {
                return numeric._dim(x);
            }
            return [x.length,y.length];
        }
        return [x.length];
    }
    return [];
}

numeric.mapreduce = function mapreduce(body,init) {
    return numeric.compile('x','accum','_s','_k',
            'if(typeof accum === "undefined") accum = '+init+';\n'+
            'if(typeof x === "number") { var xi = x; '+body+'; return accum; }\n'+
            'if(typeof _s === "undefined") _s = numeric.dim(x);\n'+
            'if(typeof _k === "undefined") _k = 0;\n'+
            'var _n = _s[_k];\n'+
            'var i,xi;\n'+
            'if(_k < _s.length-1) {\n'+
            '    for(i=_n-1;i>=0;i--) {\n'+
            '        accum = arguments.callee(x[i],accum,_s,_k+1);\n'+
            '    }'+
            '    return accum;\n'+
            '}\n'+
            'for(i=_n-1;i>=1;i-=2) { \n'+
            '    xi = x[i];\n'+
            '    '+body+';\n'+
            '    xi = x[i-1];\n'+
            '    '+body+';\n'+
            '}\n'+
            'if(i === 0) {\n'+
            '    xi = x[i];\n'+
            '    '+body+'\n'+
            '}\n'+
            'return accum;'
            );
}
numeric.mapreduce2 = function mapreduce2(body,setup) {
    return numeric.compile('x',
            'var n = x.length;\n'+
            'var i,xi;\n'+setup+';\n'+
            'for(i=n-1;i!==-1;--i) { \n'+
            '    xi = x[i];\n'+
            '    '+body+';\n'+
            '}\n'+
            'return accum;'
            );
}


numeric.same = function same(x,y) {
    var i,n;
    if(!(x instanceof Array) || !(y instanceof Array)) { return false; }
    n = x.length;
    if(n !== y.length) { return false; }
    for(i=0;i<n;i++) {
        if(x[i] === y[i]) { continue; }
        if(typeof x[i] === "object") { if(!same(x[i],y[i])) return false; }
        else { return false; }
    }
    return true;
}

numeric.rep = function rep(s,v,k) {
    if(typeof k === "undefined") { k=0; }
    var n = s[k], ret = Array(n), i;
    if(k === s.length-1) {
        for(i=n-2;i>=0;i-=2) { ret[i+1] = v; ret[i] = v; }
        if(i===-1) { ret[0] = v; }
        return ret;
    }
    for(i=n-1;i>=0;i--) { ret[i] = numeric.rep(s,v,k+1); }
    return ret;
}


numeric.dotMMsmall = function dotMMsmall(x,y) {
    var i,j,k,p,q,r,ret,foo,bar,woo,i0,k0,p0,r0;
    p = x.length; q = y.length; r = y[0].length;
    ret = Array(p);
    for(i=p-1;i>=0;i--) {
        foo = Array(r);
        bar = x[i];
        for(k=r-1;k>=0;k--) {
            woo = bar[q-1]*y[q-1][k];
            for(j=q-2;j>=1;j-=2) {
                i0 = j-1;
                woo += bar[j]*y[j][k] + bar[i0]*y[i0][k];
            }
            if(j===0) { woo += bar[0]*y[0][k]; }
            foo[k] = woo;
        }
        ret[i] = foo;
    }
    return ret;
}
numeric._getCol = function _getCol(A,j,x) {
    var n = A.length, i;
    for(i=n-1;i>0;--i) {
        x[i] = A[i][j];
        --i;
        x[i] = A[i][j];
    }
    if(i===0) x[0] = A[0][j];
}
numeric.dotMMbig = function dotMMbig(x,y){
    var gc = numeric._getCol, p = y.length, v = Array(p);
    var m = x.length, n = y[0].length, A = new Array(m), xj;
    var VV = numeric.dotVV;
    var i,j,k,z;
    --p;
    --m;
    for(i=m;i!==-1;--i) A[i] = Array(n);
    --n;
    for(i=n;i!==-1;--i) {
        gc(y,i,v);
        for(j=m;j!==-1;--j) {
            z=0;
            xj = x[j];
            A[j][i] = VV(xj,v);
        }
    }
    return A;
}

numeric.dotMV = function dotMV(x,y) {
    var p = x.length, q = y.length,i;
    var ret = Array(p), dotVV = numeric.dotVV;
    for(i=p-1;i>=0;i--) { ret[i] = dotVV(x[i],y); }
    return ret;
}

numeric.dotVM = function dotVM(x,y) {
    var i,j,k,p,q,r,ret,foo,bar,woo,i0,k0,p0,r0,s1,s2,s3,baz,accum;
    p = x.length; q = y[0].length;
    ret = Array(q);
    for(k=q-1;k>=0;k--) {
        woo = x[p-1]*y[p-1][k];
        for(j=p-2;j>=1;j-=2) {
            i0 = j-1;
            woo += x[j]*y[j][k] + x[i0]*y[i0][k];
        }
        if(j===0) { woo += x[0]*y[0][k]; }
        ret[k] = woo;
    }
    return ret;
}

numeric.dotVV = function dotVV(x,y) {
    var i,n=x.length,i1,ret = x[n-1]*y[n-1];
    for(i=n-2;i>=1;i-=2) {
        i1 = i-1;
        ret += x[i]*y[i] + x[i1]*y[i1];
    }
    if(i===0) { ret += x[0]*y[0]; }
    return ret;
}

numeric.dot = function dot(x,y) {
    var d = numeric.dim;
    switch(d(x).length*1000+d(y).length) {
    case 2002:
        if(y.length < 10) return numeric.dotMMsmall(x,y);
        else return numeric.dotMMbig(x,y);
    case 2001: return numeric.dotMV(x,y);
    case 1002: return numeric.dotVM(x,y);
    case 1001: return numeric.dotVV(x,y);
    case 1000: return numeric.mulVS(x,y);
    case 1: return numeric.mulSV(x,y);
    case 0: return x*y;
    default: throw new Error('numeric.dot only works on vectors and matrices');
    }
}

numeric.diag = function diag(d) {
    var i,i1,j,n = d.length, A = Array(n), Ai;
    for(i=n-1;i>=0;i--) {
        Ai = Array(n);
        i1 = i+2;
        for(j=n-1;j>=i1;j-=2) {
            Ai[j] = 0;
            Ai[j-1] = 0;
        }
        if(j>i) { Ai[j] = 0; }
        Ai[i] = d[i];
        for(j=i-1;j>=1;j-=2) {
            Ai[j] = 0;
            Ai[j-1] = 0;
        }
        if(j===0) { Ai[0] = 0; }
        A[i] = Ai;
    }
    return A;
}
numeric.getDiag = function(A) {
    var n = Math.min(A.length,A[0].length),i,ret = Array(n);
    for(i=n-1;i>=1;--i) {
        ret[i] = A[i][i];
        --i;
        ret[i] = A[i][i];
    }
    if(i===0) {
        ret[0] = A[0][0];
    }
    return ret;
}

numeric.identity = function identity(n) { return numeric.diag(numeric.rep([n],1)); }
numeric.pointwise = function pointwise(params,body,setup) {
    if(typeof setup === "undefined") { setup = ""; }
    var fun = [];
    var k;
    var avec = /\[i\]$/,p,thevec = '';
    var haveret = false;
    for(k=0;k<params.length;k++) {
        if(avec.test(params[k])) {
            p = params[k].substring(0,params[k].length-3);
            thevec = p;
        } else { p = params[k]; }
        if(p==='ret') haveret = true;
        fun.push(p);
    }
    fun[params.length] = '_s';
    fun[params.length+1] = '_k';
    fun[params.length+2] = (
            'if(typeof _s === "undefined") _s = numeric.dim('+thevec+');\n'+
            'if(typeof _k === "undefined") _k = 0;\n'+
            'var _n = _s[_k];\n'+
            'var i'+(haveret?'':', ret = Array(_n)')+';\n'+
            'if(_k < _s.length-1) {\n'+
            '    for(i=_n-1;i>=0;i--) ret[i] = arguments.callee('+params.join(',')+',_s,_k+1);\n'+
            '    return ret;\n'+
            '}\n'+
            setup+'\n'+
            'for(i=_n-1;i!==-1;--i) {\n'+
            '    '+body+'\n'+
            '}\n'+
            'return ret;'
            );
    return numeric.compile.apply(null,fun);
}
numeric.pointwise2 = function pointwise2(params,body,setup) {
    if(typeof setup === "undefined") { setup = ""; }
    var fun = [];
    var k;
    var avec = /\[i\]$/,p,thevec = '';
    var haveret = false;
    for(k=0;k<params.length;k++) {
        if(avec.test(params[k])) {
            p = params[k].substring(0,params[k].length-3);
            thevec = p;
        } else { p = params[k]; }
        if(p==='ret') haveret = true;
        fun.push(p);
    }
    fun[params.length] = (
            'var _n = '+thevec+'.length;\n'+
            'var i'+(haveret?'':', ret = Array(_n)')+';\n'+
            setup+'\n'+
            'for(i=_n-1;i!==-1;--i) {\n'+
            body+'\n'+
            '}\n'+
            'return ret;'
            );
    return numeric.compile.apply(null,fun);
}
numeric._biforeach = (function _biforeach(x,y,s,k,f) {
    if(k === s.length-1) { f(x,y); return; }
    var i,n=s[k];
    for(i=n-1;i>=0;i--) { _biforeach(typeof x==="object"?x[i]:x,typeof y==="object"?y[i]:y,s,k+1,f); }
});
numeric._biforeach2 = (function _biforeach2(x,y,s,k,f) {
    if(k === s.length-1) { return f(x,y); }
    var i,n=s[k],ret = Array(n);
    for(i=n-1;i>=0;--i) { ret[i] = _biforeach2(typeof x==="object"?x[i]:x,typeof y==="object"?y[i]:y,s,k+1,f); }
    return ret;
});
numeric._foreach = (function _foreach(x,s,k,f) {
    if(k === s.length-1) { f(x); return; }
    var i,n=s[k];
    for(i=n-1;i>=0;i--) { _foreach(x[i],s,k+1,f); }
});
numeric._foreach2 = (function _foreach2(x,s,k,f) {
    if(k === s.length-1) { return f(x); }
    var i,n=s[k], ret = Array(n);
    for(i=n-1;i>=0;i--) { ret[i] = _foreach2(x[i],s,k+1,f); }
    return ret;
});

/*numeric.anyV = numeric.mapreduce('if(xi) return true;','false');
numeric.allV = numeric.mapreduce('if(!xi) return false;','true');
numeric.any = function(x) { if(typeof x.length === "undefined") return x; return numeric.anyV(x); }
numeric.all = function(x) { if(typeof x.length === "undefined") return x; return numeric.allV(x); }*/

numeric.ops2 = {
        add: '+',
        sub: '-',
        mul: '*',
        div: '/',
        mod: '%',
        and: '&&',
        or:  '||',
        eq:  '===',
        neq: '!==',
        lt:  '<',
        gt:  '>',
        leq: '<=',
        geq: '>=',
        band: '&',
        bor: '|',
        bxor: '^',
        lshift: '<<',
        rshift: '>>',
        rrshift: '>>>'
};
numeric.opseq = {
        addeq: '+=',
        subeq: '-=',
        muleq: '*=',
        diveq: '/=',
        modeq: '%=',
        lshifteq: '<<=',
        rshifteq: '>>=',
        rrshifteq: '>>>=',
        bandeq: '&=',
        boreq: '|=',
        bxoreq: '^='
};
numeric.mathfuns = ['abs','acos','asin','atan','ceil','cos',
                    'exp','floor','log','round','sin','sqrt','tan',
                    'isNaN','isFinite'];
numeric.mathfuns2 = ['atan2','pow','max','min'];
numeric.ops1 = {
        neg: '-',
        not: '!',
        bnot: '~',
        clone: ''
};
numeric.mapreducers = {
        any: ['if(xi) return true;','var accum = false;'],
        all: ['if(!xi) return false;','var accum = true;'],
        sum: ['accum += xi;','var accum = 0;'],
        prod: ['accum *= xi;','var accum = 1;'],
        norm2Squared: ['accum += xi*xi;','var accum = 0;'],
        norminf: ['accum = max(accum,abs(xi));','var accum = 0, max = Math.max, abs = Math.abs;'],
        norm1: ['accum += abs(xi)','var accum = 0, abs = Math.abs;'],
        sup: ['accum = max(accum,xi);','var accum = -Infinity, max = Math.max;'],
        inf: ['accum = min(accum,xi);','var accum = Infinity, min = Math.min;']
};

(function () {
    var i,o;
    for(i=0;i<numeric.mathfuns2.length;++i) {
        o = numeric.mathfuns2[i];
        numeric.ops2[o] = o;
    }
    for(i in numeric.ops2) {
        if(numeric.ops2.hasOwnProperty(i)) {
            o = numeric.ops2[i];
            var code, codeeq, setup = '';
            if(numeric.myIndexOf.call(numeric.mathfuns2,i)!==-1) {
                setup = 'var '+o+' = Math.'+o+';\n';
                code = function(r,x,y) { return r+' = '+o+'('+x+','+y+')'; };
                codeeq = function(x,y) { return x+' = '+o+'('+x+','+y+')'; };
            } else {
                code = function(r,x,y) { return r+' = '+x+' '+o+' '+y; };
                if(numeric.opseq.hasOwnProperty(i+'eq')) {
                    codeeq = function(x,y) { return x+' '+o+'= '+y; };
                } else {
                    codeeq = function(x,y) { return x+' = '+x+' '+o+' '+y; };                    
                }
            }
            numeric[i+'VV'] = numeric.pointwise2(['x[i]','y[i]'],code('ret[i]','x[i]','y[i]'),setup);
            numeric[i+'SV'] = numeric.pointwise2(['x','y[i]'],code('ret[i]','x','y[i]'),setup);
            numeric[i+'VS'] = numeric.pointwise2(['x[i]','y'],code('ret[i]','x[i]','y'),setup);
            numeric[i] = numeric.compile(
                    'var n = arguments.length, i, x = arguments[0], y;\n'+
                    'var VV = numeric.'+i+'VV, VS = numeric.'+i+'VS, SV = numeric.'+i+'SV;\n'+
                    'var dim = numeric.dim;\n'+
                    'for(i=1;i!==n;++i) { \n'+
                    '  y = arguments[i];\n'+
                    '  if(typeof x === "object") {\n'+
                    '      if(typeof y === "object") x = numeric._biforeach2(x,y,dim(x),0,VV);\n'+
                    '      else x = numeric._biforeach2(x,y,dim(x),0,VS);\n'+
                    '  } else if(typeof y === "object") x = numeric._biforeach2(x,y,dim(y),0,SV);\n'+
                    '  else '+codeeq('x','y')+'\n'+
                    '}\nreturn x;\n');
            numeric[o] = numeric[i];
            numeric[i+'eqV'] = numeric.pointwise2(['ret[i]','x[i]'], codeeq('ret[i]','x[i]'),setup);
            numeric[i+'eqS'] = numeric.pointwise2(['ret[i]','x'], codeeq('ret[i]','x'),setup);
            numeric[i+'eq'] = numeric.compile(
                    'var n = arguments.length, i, x = arguments[0], y;\n'+
                    'var V = numeric.'+i+'eqV, S = numeric.'+i+'eqS\n'+
                    'var s = numeric.dim(x);\n'+
                    'for(i=1;i!==n;++i) { \n'+
                    '  y = arguments[i];\n'+
                    '  if(typeof y === "object") numeric._biforeach(x,y,s,0,V);\n'+
                    '  else numeric._biforeach(x,y,s,0,S);\n'+
                    '}\nreturn x;\n');
        }
    }
    for(i=0;i<numeric.mathfuns2.length;++i) {
        o = numeric.mathfuns2[i];
        delete numeric.ops2[o];
    }
    for(i=0;i<numeric.mathfuns.length;++i) {
        o = numeric.mathfuns[i];
        numeric.ops1[o] = o;
    }
    for(i in numeric.ops1) {
        if(numeric.ops1.hasOwnProperty(i)) {
            setup = '';
            o = numeric.ops1[i];
            if(numeric.myIndexOf.call(numeric.mathfuns,i)!==-1) {
                if(Math.hasOwnProperty(o)) setup = 'var '+o+' = Math.'+o+';\n';
            }
            numeric[i+'eqV'] = numeric.pointwise2(['ret[i]'],'ret[i] = '+o+'(ret[i]);',setup);
            numeric[i+'eq'] = numeric.compile('x',
                    'if(typeof x !== "object") return '+o+'x\n'+
                    'var i;\n'+
                    'var V = numeric.'+i+'eqV;\n'+
                    'var s = numeric.dim(x);\n'+
                    'numeric._foreach(x,s,0,V);\n'+
                    'return x;\n');
            numeric[i+'V'] = numeric.pointwise2(['x[i]'],'ret[i] = '+o+'(x[i]);',setup);
            numeric[i] = numeric.compile('x',
                    'if(typeof x !== "object") return '+o+'(x)\n'+
                    'var i;\n'+
                    'var V = numeric.'+i+'V;\n'+
                    'var s = numeric.dim(x);\n'+
                    'return numeric._foreach2(x,s,0,V);\n');
        }
    }
    for(i=0;i<numeric.mathfuns.length;++i) {
        o = numeric.mathfuns[i];
        delete numeric.ops1[o];
    }
    for(i in numeric.mapreducers) {
        if(numeric.mapreducers.hasOwnProperty(i)) {
            o = numeric.mapreducers[i];
            numeric[i+'V'] = numeric.mapreduce2(o[0],o[1]);
            numeric[i] = numeric.compile('x','s','k',
                    o[1]+
                    'if(typeof x !== "object") {'+
                    '    xi = x;\n'+
                    o[0]+';\n'+
                    '    return accum;\n'+
                    '}'+
                    'if(typeof s === "undefined") s = numeric.dim(x);\n'+
                    'if(typeof k === "undefined") k = 0;\n'+
                    'if(k === s.length-1) return numeric.'+i+'V(x);\n'+
                    'var xi;\n'+
                    'var n = x.length, i;\n'+
                    'for(i=n-1;i!==-1;--i) {\n'+
                    '   xi = arguments.callee(x[i]);\n'+
                    o[0]+';\n'+
                    '}\n'+
                    'return accum;\n');
        }
    }
}());

numeric.truncVV = numeric.pointwise(['x[i]','y[i]'],'ret[i] = round(x[i]/y[i])*y[i];','var round = Math.round;');
numeric.truncVS = numeric.pointwise(['x[i]','y'],'ret[i] = round(x[i]/y)*y;','var round = Math.round;');
numeric.truncSV = numeric.pointwise(['x','y[i]'],'ret[i] = round(x/y[i])*y[i];','var round = Math.round;');
numeric.trunc = function trunc(x,y) {
    if(typeof x === "object") {
        if(typeof y === "object") return numeric.truncVV(x,y);
        return numeric.truncVS(x,y);
    }
    if (typeof y === "object") return numeric.truncSV(x,y);
    return Math.round(x/y)*y;
}

numeric.inv = function inv(x) {
    var s = numeric.dim(x), abs = Math.abs, m = s[0], n = s[1];
    var A = numeric.clone(x), Ai, Aj;
    var I = numeric.identity(m), Ii, Ij;
    var i,j,k,x;
    for(j=0;j<n;++j) {
        var i0 = -1;
        var v0 = -1;
        for(i=j;i!==m;++i) { k = abs(A[i][j]); if(k>v0) { i0 = i; v0 = k; } }
        Aj = A[i0]; A[i0] = A[j]; A[j] = Aj;
        Ij = I[i0]; I[i0] = I[j]; I[j] = Ij;
        x = Aj[j];
        for(k=j;k!==n;++k)    Aj[k] /= x; 
        for(k=n-1;k!==-1;--k) Ij[k] /= x;
        for(i=m-1;i!==-1;--i) {
            if(i!==j) {
                Ai = A[i];
                Ii = I[i];
                x = Ai[j];
                for(k=j+1;k!==n;++k)  Ai[k] -= Aj[k]*x;
                for(k=n-1;k>0;--k) { Ii[k] -= Ij[k]*x; --k; Ii[k] -= Ij[k]*x; }
                if(k===0) Ii[0] -= Ij[0]*x;
            }
        }
    }
    return I;
}

numeric.det = function det(x) {
    var s = numeric.dim(x);
    if(s.length !== 2 || s[0] !== s[1]) { throw new Error('numeric: det() only works on square matrices'); }
    var n = s[0], ret = 1,i,j,k,A = numeric.clone(x),Aj,Ai,alpha,temp,k1,k2,k3;
    for(j=0;j<n-1;j++) {
        k=j;
        for(i=j+1;i<n;i++) { if(Math.abs(A[i][j]) > Math.abs(A[k][j])) { k = i; } }
        if(k !== j) {
            temp = A[k]; A[k] = A[j]; A[j] = temp;
            ret *= -1;
        }
        Aj = A[j];
        for(i=j+1;i<n;i++) {
            Ai = A[i];
            alpha = Ai[j]/Aj[j];
            for(k=j+1;k<n-1;k+=2) {
                k1 = k+1;
                Ai[k] -= Aj[k]*alpha;
                Ai[k1] -= Aj[k1]*alpha;
            }
            if(k!==n) { Ai[k] -= Aj[k]*alpha; }
        }
        if(Aj[j] === 0) { return 0; }
        ret *= Aj[j];
    }
    return ret*A[j][j];
}

numeric.transpose = function transpose(x) {
    var i,j,m = x.length,n = x[0].length, ret=Array(n),A0,A1,Bj;
    for(j=0;j<n;j++) ret[j] = Array(m);
    for(i=m-1;i>=1;i-=2) {
        A1 = x[i];
        A0 = x[i-1];
        for(j=n-1;j>=1;--j) {
            Bj = ret[j]; Bj[i] = A1[j]; Bj[i-1] = A0[j];
            --j;
            Bj = ret[j]; Bj[i] = A1[j]; Bj[i-1] = A0[j];
        }
        if(j===0) {
            Bj = ret[0]; Bj[i] = A1[0]; Bj[i-1] = A0[0];
        }
    }
    if(i===0) {
        A0 = x[0];
        for(j=n-1;j>=1;--j) {
            ret[j][0] = A0[j];
            --j;
            ret[j][0] = A0[j];
        }
        if(j===0) { ret[0][0] = A0[0]; }
    }
    return ret;
}
numeric.negtranspose = function negtranspose(x) {
    var i,j,m = x.length,n = x[0].length, ret=Array(n),A0,A1,Bj;
    for(j=0;j<n;j++) ret[j] = Array(m);
    for(i=m-1;i>=1;i-=2) {
        A1 = x[i];
        A0 = x[i-1];
        for(j=n-1;j>=1;--j) {
            Bj = ret[j]; Bj[i] = -A1[j]; Bj[i-1] = -A0[j];
            --j;
            Bj = ret[j]; Bj[i] = -A1[j]; Bj[i-1] = -A0[j];
        }
        if(j===0) {
            Bj = ret[0]; Bj[i] = -A1[0]; Bj[i-1] = -A0[0];
        }
    }
    if(i===0) {
        A0 = x[0];
        for(j=n-1;j>=1;--j) {
            ret[j][0] = -A0[j];
            --j;
            ret[j][0] = -A0[j];
        }
        if(j===0) { ret[0][0] = -A0[0]; }
    }
    return ret;
}

numeric._random = function _random(s,k) {
    var i,n=s[k],ret=Array(n), rnd;
    if(k === s.length-1) {
        rnd = Math.random;
        for(i=n-1;i>=1;i-=2) {
            ret[i] = rnd();
            ret[i-1] = rnd();
        }
        if(i===0) { ret[0] = rnd(); }
        return ret;
    }
    for(i=n-1;i>=0;i--) ret[i] = _random(s,k+1);
    return ret;
}
numeric.random = function random(s) { return numeric._random(s,0); }

numeric.norm2 = function norm2(x) { return Math.sqrt(numeric.norm2Squared(x)); }

numeric.linspace = function linspace(a,b,n) {
    if(typeof n === "undefined") n = Math.max(Math.round(b-a)+1,1);
    if(n<2) { return n===1?[a]:[]; }
    var i,ret = Array(n);
    n--;
    for(i=n;i>=0;i--) { ret[i] = (i*b+(n-i)*a)/n; }
    return ret;
}

numeric.getBlock = function getBlock(x,from,to) {
    var s = numeric.dim(x);
    function foo(x,k) {
        var i,a = from[k], n = to[k]-a, ret = Array(n);
        if(k === s.length-1) {
            for(i=n;i>=0;i--) { ret[i] = x[i+a]; }
            return ret;
        }
        for(i=n;i>=0;i--) { ret[i] = foo(x[i+a],k+1); }
        return ret;
    }
    return foo(x,0);
}

numeric.setBlock = function setBlock(x,from,to,B) {
    var s = numeric.dim(x);
    function foo(x,y,k) {
        var i,a = from[k], n = to[k]-a;
        if(k === s.length-1) { for(i=n;i>=0;i--) { x[i+a] = y[i]; } }
        for(i=n;i>=0;i--) { foo(x[i+a],y[i],k+1); }
    }
    foo(x,B,0);
    return x;
}

numeric.getRange = function getRange(A,I,J) {
    var m = I.length, n = J.length;
    var i,j;
    var B = Array(m), Bi, AI;
    for(i=m-1;i!==-1;--i) {
        B[i] = Array(n);
        Bi = B[i];
        AI = A[I[i]];
        for(j=n-1;j!==-1;--j) Bi[j] = AI[J[j]];
    }
    return B;
}

numeric.blockMatrix = function blockMatrix(X) {
    var s = numeric.dim(X);
    if(s.length<4) return numeric.blockMatrix([X]);
    var m=s[0],n=s[1],M,N,i,j,Xij;
    M = 0; N = 0;
    for(i=0;i<m;++i) M+=X[i][0].length;
    for(j=0;j<n;++j) N+=X[0][j][0].length;
    var Z = Array(M);
    for(i=0;i<M;++i) Z[i] = Array(N);
    var I=0,J,ZI,k,l,Xijk;
    for(i=0;i<m;++i) {
        J=N;
        for(j=n-1;j!==-1;--j) {
            Xij = X[i][j];
            J -= Xij[0].length;
            for(k=Xij.length-1;k!==-1;--k) {
                Xijk = Xij[k];
                ZI = Z[I+k];
                for(l = Xijk.length-1;l!==-1;--l) ZI[J+l] = Xijk[l];
            }
        }
        I += X[i][0].length;
    }
    return Z;
}

numeric.tensor = function tensor(x,y) {
    if(typeof x === "number" || typeof y === "number") return numeric.mul(x,y);
    var s1 = numeric.dim(x), s2 = numeric.dim(y);
    if(s1.length !== 1 || s2.length !== 1) {
        throw new Error('numeric: tensor product is only defined for vectors');
    }
    var m = s1[0], n = s2[0], A = Array(m), Ai, i,j,xi;
    for(i=m-1;i>=0;i--) {
        Ai = Array(n);
        xi = x[i];
        for(j=n-1;j>=3;--j) {
            Ai[j] = xi * y[j];
            --j;
            Ai[j] = xi * y[j];
            --j;
            Ai[j] = xi * y[j];
            --j;
            Ai[j] = xi * y[j];
        }
        while(j>=0) { Ai[j] = xi * y[j]; --j; }
        A[i] = Ai;
    }
    return A;
}

// 3. The Tensor type T
numeric.T = function T(x,y) { this.x = x; this.y = y; }
numeric.t = function t(x,y) { return new numeric.T(x,y); }

numeric.Tbinop = function Tbinop(rr,rc,cr,cc,setup) {
    var io = numeric.indexOf;
    if(typeof setup !== "string") {
        var k;
        setup = '';
        for(k in numeric) {
            if(numeric.hasOwnProperty(k) && (rr.indexOf(k)>=0 || rc.indexOf(k)>=0 || cr.indexOf(k)>=0 || cc.indexOf(k)>=0) && k.length>1) {
                setup += 'var '+k+' = numeric.'+k+';\n';
            }
        }
    }
    return numeric.compile(['y'],
            'var x = this;\n'+
            'if(!(y instanceof numeric.T)) { y = new numeric.T(y); }\n'+
            setup+'\n'+
            'if(x.y) {'+
            '  if(y.y) {'+
            '    return new numeric.T('+cc+');\n'+
            '  }\n'+
            '  return new numeric.T('+cr+');\n'+
            '}\n'+
            'if(y.y) {\n'+
            '  return new numeric.T('+rc+');\n'+
            '}\n'+
            'return new numeric.T('+rr+');\n'
    );
}

numeric.T.prototype.add = numeric.Tbinop(
        'add(x.x,y.x)',
        'add(x.x,y.x),y.y',
        'add(x.x,y.x),x.y',
        'add(x.x,y.x),add(x.y,y.y)');
numeric.T.prototype.sub = numeric.Tbinop(
        'sub(x.x,y.x)',
        'sub(x.x,y.x),neg(y.y)',
        'sub(x.x,y.x),x.y',
        'sub(x.x,y.x),sub(x.y,y.y)');
numeric.T.prototype.mul = numeric.Tbinop(
        'mul(x.x,y.x)',
        'mul(x.x,y.x),mul(x.x,y.y)',
        'mul(x.x,y.x),mul(x.y,y.x)',
        'sub(mul(x.x,y.x),mul(x.y,y.y)),add(mul(x.x,y.y),mul(x.y,y.x))');

numeric.T.prototype.reciprocal = function reciprocal() {
    var mul = numeric.mul, div = numeric.div;
    if(this.y) {
        var d = numeric.add(mul(this.x,this.x),mul(this.y,this.y));
        return new numeric.T(div(this.x,d),div(numeric.neg(this.y),d));
    }
    return new T(div(1,this.x));
}
numeric.T.prototype.div = function div(y) {
    if(!(y instanceof numeric.T)) y = new numeric.T(y);
    if(y.y) { return this.mul(y.reciprocal()); }
    var div = numeric.div;
    if(this.y) { return new numeric.T(div(this.x,y.x),div(this.y,y.x)); }
    return new numeric.T(div(this.x,y.x));
}
numeric.T.prototype.dot = numeric.Tbinop(
        'dot(x.x,y.x)',
        'dot(x.x,y.x),dot(x.x,y.y)',
        'dot(x.x,y.x),dot(x.y,y.x)',
        'sub(dot(x.x,y.x),dot(x.y,y.y)),add(dot(x.x,y.y),dot(x.y,y.x))'
        );
numeric.T.prototype.transpose = function transpose() {
    var t = numeric.transpose, x = this.x, y = this.y;
    if(y) { return new numeric.T(t(x),t(y)); }
    return new numeric.T(t(x));
}
numeric.T.prototype.transjugate = function transjugate() {
    var t = numeric.transpose, x = this.x, y = this.y;
    if(y) { return new numeric.T(t(x),numeric.negtranspose(y)); }
    return new numeric.T(t(x));
}
numeric.Tunop = function Tunop(r,c,s) {
    if(typeof s !== "string") { s = ''; }
    return numeric.compile(
            'var x = this;\n'+
            s+'\n'+
            'if(x.y) {'+
            '  '+c+';\n'+
            '}\n'+
            r+';\n'
    );
}

numeric.T.prototype.exp = numeric.Tunop(
        'return new numeric.T(ex)',
        'return new numeric.T(mul(cos(x.y),ex),mul(sin(x.y),ex))',
        'var ex = numeric.exp(x.x), cos = numeric.cos, sin = numeric.sin, mul = numeric.mul;');
numeric.T.prototype.conj = numeric.Tunop(
        'return new numeric.T(x.x);',
        'return new numeric.T(x.x,numeric.neg(x.y));');
numeric.T.prototype.neg = numeric.Tunop(
        'return new numeric.T(neg(x.x));',
        'return new numeric.T(neg(x.x),neg(x.y));',
        'var neg = numeric.neg;');
numeric.T.prototype.sin = numeric.Tunop(
        'return new numeric.T(numeric.sin(x.x))',
        'return x.exp().sub(x.neg().exp()).div(new numeric.T(0,2));');
numeric.T.prototype.cos = numeric.Tunop(
        'return new numeric.T(numeric.cos(x.x))',
        'return x.exp().add(x.neg().exp()).div(2);');
numeric.T.prototype.abs = numeric.Tunop(
        'return new numeric.T(numeric.abs(x.x));',
        'return new numeric.T(numeric.sqrt(numeric.add(mul(x.x,x.x),mul(x.y,x.y))));',
        'var mul = numeric.mul;');
numeric.T.prototype.log = numeric.Tunop(
        'return new numeric.T(numeric.log(x.x));',
        'var theta = new numeric.T(numeric.atan2(x.y,x.x)), r = x.abs();\n'+
        'return new numeric.T(numeric.log(r.x),theta.x);');
numeric.T.prototype.norm2 = numeric.Tunop(
        'return numeric.norm2(x.x);',
        'var f = numeric.norm2Squared;\n'+
        'return Math.sqrt(f(x.x)+f(x.y));');
numeric.T.prototype.inv = function inv() {
    var A = this;
    if(typeof A.y === "undefined") { return new numeric.T(numeric.inv(A.x)); }
    var n = A.x.length, i, j, k;
    var Rx = numeric.identity(n),Ry = numeric.rep([n,n],0);
    var Ax = numeric.clone(A.x), Ay = numeric.clone(A.y);
    var Aix, Aiy, Ajx, Ajy, Rix, Riy, Rjx, Rjy;
    var i,j,k,d,d1,ax,ay,bx,by,temp;
    for(i=0;i<n;i++) {
        ax = Ax[i][i]; ay = Ay[i][i];
        d = ax*ax+ay*ay;
        k = i;
        for(j=i+1;j<n;j++) {
            ax = Ax[j][i]; ay = Ay[j][i];
            d1 = ax*ax+ay*ay;
            if(d1 > d) { k=j; d = d1; }
        }
        if(k!==i) {
            temp = Ax[i]; Ax[i] = Ax[k]; Ax[k] = temp;
            temp = Ay[i]; Ay[i] = Ay[k]; Ay[k] = temp;
            temp = Rx[i]; Rx[i] = Rx[k]; Rx[k] = temp;
            temp = Ry[i]; Ry[i] = Ry[k]; Ry[k] = temp;
        }
        Aix = Ax[i]; Aiy = Ay[i];
        Rix = Rx[i]; Riy = Ry[i];
        ax = Aix[i]; ay = Aiy[i];
        for(j=i+1;j<n;j++) {
            bx = Aix[j]; by = Aiy[j];
            Aix[j] = (bx*ax+by*ay)/d;
            Aiy[j] = (by*ax-bx*ay)/d;
        }
        for(j=0;j<n;j++) {
            bx = Rix[j]; by = Riy[j];
            Rix[j] = (bx*ax+by*ay)/d;
            Riy[j] = (by*ax-bx*ay)/d;
        }
        for(j=i+1;j<n;j++) {
            Ajx = Ax[j]; Ajy = Ay[j];
            Rjx = Rx[j]; Rjy = Ry[j];
            ax = Ajx[i]; ay = Ajy[i];
            for(k=i+1;k<n;k++) {
                bx = Aix[k]; by = Aiy[k];
                Ajx[k] -= bx*ax-by*ay;
                Ajy[k] -= by*ax+bx*ay;
            }
            for(k=0;k<n;k++) {
                bx = Rix[k]; by = Riy[k];
                Rjx[k] -= bx*ax-by*ay;
                Rjy[k] -= by*ax+bx*ay;
            }
        }
    }
    for(i=n-1;i>0;i--) {
        Rix = Rx[i]; Riy = Ry[i];
        for(j=i-1;j>=0;j--) {
            Rjx = Rx[j]; Rjy = Ry[j];
            ax = Ax[j][i]; ay = Ay[j][i];
            for(k=n-1;k>=0;k--) {
                bx = Rix[k]; by = Riy[k];
                Rjx[k] -= ax*bx - ay*by;
                Rjy[k] -= ax*by + ay*bx;
            }
        }
    }
    return new numeric.T(Rx,Ry);
}
numeric.T.prototype.get = function get(i) {
    var x = this.x, y = this.y, k = 0, ik, n = i.length;
    if(y) {
        while(k<n) {
            ik = i[k];
            x = x[ik];
            y = y[ik];
            k++;
        }
        return new numeric.T(x,y);
    }
    while(k<n) {
        ik = i[k];
        x = x[ik];
        k++;
    }
    return new numeric.T(x);
}
numeric.T.prototype.set = function set(i,v) {
    var x = this.x, y = this.y, k = 0, ik, n = i.length, vx = v.x, vy = v.y;
    if(n===0) {
        if(vy) { this.y = vy; }
        else if(y) { this.y = undefined; }
        this.x = x;
        return this;
    }
    if(vy) {
        if(y) { /* ok */ }
        else {
            y = numeric.rep(numeric.dim(x),0);
            this.y = y;
        }
        while(k<n-1) {
            ik = i[k];
            x = x[ik];
            y = y[ik];
            k++;
        }
        ik = i[k];
        x[ik] = vx;
        y[ik] = vy;
        return this;
    }
    if(y) {
        while(k<n-1) {
            ik = i[k];
            x = x[ik];
            y = y[ik];
            k++;
        }
        ik = i[k];
        x[ik] = vx;
        if(vx instanceof Array) y[ik] = numeric.rep(numeric.dim(vx),0);
        else y[ik] = 0;
        return this;
    }
    while(k<n-1) {
        ik = i[k];
        x = x[ik];
        k++;
    }
    ik = i[k];
    x[ik] = vx;
    return this;
}
numeric.T.prototype.getRows = function getRows(i0,i1) {
    var n = i1-i0+1, j;
    var rx = Array(n), ry, x = this.x, y = this.y;
    for(j=i0;j<=i1;j++) { rx[j-i0] = x[j]; }
    if(y) {
        ry = Array(n);
        for(j=i0;j<=i1;j++) { ry[j-i0] = y[j]; }
        return new numeric.T(rx,ry);
    }
    return new numeric.T(rx);
}
numeric.T.prototype.setRows = function setRows(i0,i1,A) {
    var j;
    var rx = this.x, ry = this.y, x = A.x, y = A.y;
    for(j=i0;j<=i1;j++) { rx[j] = x[j-i0]; }
    if(y) {
        if(!ry) { ry = numeric.rep(numeric.dim(rx),0); this.y = ry; }
        for(j=i0;j<=i1;j++) { ry[j] = y[j-i0]; }
    } else if(ry) {
        for(j=i0;j<=i1;j++) { ry[j] = numeric.rep([x[j-i0].length],0); }
    }
    return this;
}
numeric.T.prototype.getRow = function getRow(k) {
    var x = this.x, y = this.y;
    if(y) { return new numeric.T(x[k],y[k]); }
    return new numeric.T(x[k]);
}
numeric.T.prototype.setRow = function setRow(i,v) {
    var rx = this.x, ry = this.y, x = v.x, y = v.y;
    rx[i] = x;
    if(y) {
        if(!ry) { ry = numeric.rep(numeric.dim(rx),0); this.y = ry; }
        ry[i] = y;
    } else if(ry) {
        ry = numeric.rep([x.length],0);
    }
    return this;
}

numeric.T.prototype.getBlock = function getBlock(from,to) {
    var x = this.x, y = this.y, b = numeric.getBlock;
    if(y) { return new numeric.T(b(x,from,to),b(y,from,to)); }
    return new numeric.T(b(x,from,to));
}
numeric.T.prototype.setBlock = function setBlock(from,to,A) {
    if(!(A instanceof numeric.T)) A = new numeric.T(A);
    var x = this.x, y = this.y, b = numeric.setBlock, Ax = A.x, Ay = A.y;
    if(Ay) {
        if(!y) { this.y = numeric.rep(numeric.dim(this),0); y = this.y; }
        b(x,from,to,Ax);
        b(y,from,to,Ay);
        return this;
    }
    b(x,from,to,Ax);
    if(y) b(y,from,to,numeric.rep(numeric.dim(Ax),0));
}
numeric.T.rep = function rep(s,v) {
    var T = numeric.T;
    if(!(v instanceof T)) v = new T(v);
    var x = v.x, y = v.y, r = numeric.rep;
    if(y) return new T(r(s,x),r(s,y));
    return new T(r(s,x));
}
numeric.T.diag = function diag(d) {
    if(!(d instanceof numeric.T)) d = new numeric.T(d);
    var x = d.x, y = d.y, diag = numeric.diag;
    if(y) return new numeric.T(diag(x),diag(y));
    return new numeric.T(diag(x));
}
numeric.T.eig = function eig() {
    if(this.y) { throw new Error('eig: not implemented for complex matrices.'); }
    return numeric.eig(this.x);
}
numeric.T.identity = function identity(n) { return new numeric.T(numeric.identity(n)); }
numeric.T.prototype.getDiag = function getDiag() {
    var n = numeric;
    var x = this.x, y = this.y;
    if(y) { return new n.T(n.getDiag(x),n.getDiag(y)); }
    return new n.T(n.getDiag(x));
}

// 4. Eigenvalues of real matrices

numeric.house = function house(x) {
    var v = numeric.clone(x);
    var s = x[0] >= 0 ? 1 : -1;
    var alpha = s*numeric.norm2(x);
    v[0] += alpha;
    var foo = numeric.norm2(v);
    if(foo === 0) { /* this should not happen */ throw new Error('eig: internal error'); }
    return numeric.div(v,foo);
}

numeric.toUpperHessenberg = function toUpperHessenberg(me) {
    var s = numeric.dim(me);
    if(s.length !== 2 || s[0] !== s[1]) { throw new Error('numeric: toUpperHessenberg() only works on square matrices'); }
    var m = s[0], i,j,k,x,v,A = numeric.clone(me),B,C,Ai,Ci,Q = numeric.identity(m),Qi;
    for(j=0;j<m-2;j++) {
        x = Array(m-j-1);
        for(i=j+1;i<m;i++) { x[i-j-1] = A[i][j]; }
        if(numeric.norm2(x)>0) {
            v = numeric.house(x);
            B = numeric.getBlock(A,[j+1,j],[m-1,m-1]);
            C = numeric.tensor(v,numeric.dot(v,B));
            for(i=j+1;i<m;i++) { Ai = A[i]; Ci = C[i-j-1]; for(k=j;k<m;k++) Ai[k] -= 2*Ci[k-j]; }
            B = numeric.getBlock(A,[0,j+1],[m-1,m-1]);
            C = numeric.tensor(numeric.dot(B,v),v);
            for(i=0;i<m;i++) { Ai = A[i]; Ci = C[i]; for(k=j+1;k<m;k++) Ai[k] -= 2*Ci[k-j-1]; }
            B = Array(m-j-1);
            for(i=j+1;i<m;i++) B[i-j-1] = Q[i];
            C = numeric.tensor(v,numeric.dot(v,B));
            for(i=j+1;i<m;i++) { Qi = Q[i]; Ci = C[i-j-1]; for(k=0;k<m;k++) Qi[k] -= 2*Ci[k]; }
        }
    }
    return {H:A, Q:Q};
}

numeric.epsilon = 2.220446049250313e-16;

numeric.QRFrancis = function(H,maxiter) {
    if(typeof maxiter === "undefined") { maxiter = 10000; }
    H = numeric.clone(H);
    var H0 = numeric.clone(H);
    var s = numeric.dim(H),m=s[0],x,v,a,b,c,d,det,tr, Hloc, Q = numeric.identity(m), Qi, Hi, B, C, Ci,i,j,k,iter;
    if(m<3) { return {Q:Q, B:[ [0,m-1] ]}; }
    var epsilon = numeric.epsilon;
    for(iter=0;iter<maxiter;iter++) {
        for(j=0;j<m-1;j++) {
            if(Math.abs(H[j+1][j]) < epsilon*(Math.abs(H[j][j])+Math.abs(H[j+1][j+1]))) {
                var QH1 = numeric.QRFrancis(numeric.getBlock(H,[0,0],[j,j]),maxiter);
                var QH2 = numeric.QRFrancis(numeric.getBlock(H,[j+1,j+1],[m-1,m-1]),maxiter);
                B = Array(j+1);
                for(i=0;i<=j;i++) { B[i] = Q[i]; }
                C = numeric.dot(QH1.Q,B);
                for(i=0;i<=j;i++) { Q[i] = C[i]; }
                B = Array(m-j-1);
                for(i=j+1;i<m;i++) { B[i-j-1] = Q[i]; }
                C = numeric.dot(QH2.Q,B);
                for(i=j+1;i<m;i++) { Q[i] = C[i-j-1]; }
                return {Q:Q,B:QH1.B.concat(numeric.add(QH2.B,j+1))};
            }
        }
        a = H[m-2][m-2]; b = H[m-2][m-1];
        c = H[m-1][m-2]; d = H[m-1][m-1];
        tr = a+d;
        det = (a*d-b*c);
        Hloc = numeric.getBlock(H, [0,0], [2,2]);
        if(tr*tr>=4*det) {
            var s1,s2;
            s1 = 0.5*(tr+Math.sqrt(tr*tr-4*det));
            s2 = 0.5*(tr-Math.sqrt(tr*tr-4*det));
            Hloc = numeric.add(numeric.sub(numeric.dot(Hloc,Hloc),
                                           numeric.mul(Hloc,s1+s2)),
                               numeric.diag(numeric.rep([3],s1*s2)));
        } else {
            Hloc = numeric.add(numeric.sub(numeric.dot(Hloc,Hloc),
                                           numeric.mul(Hloc,tr)),
                               numeric.diag(numeric.rep([3],det)));
        }
        x = [Hloc[0][0],Hloc[1][0],Hloc[2][0]];
        v = numeric.house(x);
        B = [H[0],H[1],H[2]];
        C = numeric.tensor(v,numeric.dot(v,B));
        for(i=0;i<3;i++) { Hi = H[i]; Ci = C[i]; for(k=0;k<m;k++) Hi[k] -= 2*Ci[k]; }
        B = numeric.getBlock(H, [0,0],[m-1,2]);
        C = numeric.tensor(numeric.dot(B,v),v);
        for(i=0;i<m;i++) { Hi = H[i]; Ci = C[i]; for(k=0;k<3;k++) Hi[k] -= 2*Ci[k]; }
        B = [Q[0],Q[1],Q[2]];
        C = numeric.tensor(v,numeric.dot(v,B));
        for(i=0;i<3;i++) { Qi = Q[i]; Ci = C[i]; for(k=0;k<m;k++) Qi[k] -= 2*Ci[k]; }
        var J;
        for(j=0;j<m-2;j++) {
            for(k=j;k<=j+1;k++) {
                if(Math.abs(H[k+1][k]) < epsilon*(Math.abs(H[k][k])+Math.abs(H[k+1][k+1]))) {
                    var QH1 = numeric.QRFrancis(numeric.getBlock(H,[0,0],[k,k]),maxiter);
                    var QH2 = numeric.QRFrancis(numeric.getBlock(H,[k+1,k+1],[m-1,m-1]),maxiter);
                    B = Array(k+1);
                    for(i=0;i<=k;i++) { B[i] = Q[i]; }
                    C = numeric.dot(QH1.Q,B);
                    for(i=0;i<=k;i++) { Q[i] = C[i]; }
                    B = Array(m-k-1);
                    for(i=k+1;i<m;i++) { B[i-k-1] = Q[i]; }
                    C = numeric.dot(QH2.Q,B);
                    for(i=k+1;i<m;i++) { Q[i] = C[i-k-1]; }
                    return {Q:Q,B:QH1.B.concat(numeric.add(QH2.B,k+1))};
                }
            }
            J = Math.min(m-1,j+3);
            x = Array(J-j);
            for(i=j+1;i<=J;i++) { x[i-j-1] = H[i][j]; }
            v = numeric.house(x);
            B = numeric.getBlock(H, [j+1,j],[J,m-1]);
            C = numeric.tensor(v,numeric.dot(v,B));
            for(i=j+1;i<=J;i++) { Hi = H[i]; Ci = C[i-j-1]; for(k=j;k<m;k++) Hi[k] -= 2*Ci[k-j]; }
            B = numeric.getBlock(H, [0,j+1],[m-1,J]);
            C = numeric.tensor(numeric.dot(B,v),v);
            for(i=0;i<m;i++) { Hi = H[i]; Ci = C[i]; for(k=j+1;k<=J;k++) Hi[k] -= 2*Ci[k-j-1]; }
            B = Array(J-j);
            for(i=j+1;i<=J;i++) B[i-j-1] = Q[i];
            C = numeric.tensor(v,numeric.dot(v,B));
            for(i=j+1;i<=J;i++) { Qi = Q[i]; Ci = C[i-j-1]; for(k=0;k<m;k++) Qi[k] -= 2*Ci[k]; }
        }
    }
    throw new Error('numeric: eigenvalue iteration does not converge -- increase maxiter?');
}

numeric.eig = function eig(A,maxiter) {
    var QH = numeric.toUpperHessenberg(A);
    var QB = numeric.QRFrancis(QH.H,maxiter);
    var T = numeric.T;
    var n = A.length,i,k,flag = false,B = QB.B,H = numeric.dot(QB.Q,numeric.dot(QH.H,numeric.transpose(QB.Q)));
    var Q = new T(numeric.dot(QB.Q,QH.Q)),Q0;
    var m = B.length,j;
    var a,b,c,d,p1,p2,disc,x,y,p,q,n1,n2;
    var sqrt = Math.sqrt;
    for(k=0;k<m;k++) {
        i = B[k][0];
        if(i === B[k][1]) {
            // nothing
        } else {
            j = i+1;
            a = H[i][i];
            b = H[i][j];
            c = H[j][i];
            d = H[j][j];
            if(b === 0 && c === 0) continue;
            p1 = -a-d;
            p2 = a*d-b*c;
            disc = p1*p1-4*p2;
            if(disc>=0) {
                if(p1<0) x = -0.5*(p1-sqrt(disc));
                else     x = -0.5*(p1+sqrt(disc));
                n1 = (a-x)*(a-x)+b*b;
                n2 = c*c+(d-x)*(d-x);
                if(n1>n2) {
                    n1 = sqrt(n1);
                    p = (a-x)/n1;
                    q = b/n1;
                } else {
                    n2 = sqrt(n2);
                    p = c/n2;
                    q = (d-x)/n2;
                }
                Q0 = new T([[q,-p],[p,q]]);
                Q.setRows(i,j,Q0.dot(Q.getRows(i,j)));
            } else {
                x = -0.5*p1;
                y = 0.5*sqrt(-disc);
                n1 = (a-x)*(a-x)+b*b;
                n2 = c*c+(d-x)*(d-x);
                if(n1>n2) {
                    n1 = sqrt(n1+y*y);
                    p = (a-x)/n1;
                    q = b/n1;
                    x = 0;
                    y /= n1;
                } else {
                    n2 = sqrt(n2+y*y);
                    p = c/n2;
                    q = (d-x)/n2;
                    x = y/n2;
                    y = 0;
                }
                Q0 = new T([[q,-p],[p,q]],[[x,y],[y,-x]]);
                Q.setRows(i,j,Q0.dot(Q.getRows(i,j)));
            }
        }
    }
    var R = Q.dot(A).dot(Q.transjugate()), n = A.length, E = numeric.T.identity(n);
    for(j=0;j<n;j++) {
        if(j>0) {
            for(k=j-1;k>=0;k--) {
                var Rk = R.get([k,k]), Rj = R.get([j,j]);
                if(numeric.neq(Rk.x,Rj.x) || numeric.neq(Rk.y,Rj.y)) {
                    x = R.getRow(k).getBlock([k],[j-1]);
                    y = E.getRow(j).getBlock([k],[j-1]);
                    E.set([j,k],(R.get([k,j]).neg().sub(x.dot(y))).div(Rk.sub(Rj)));
                } else {
                    E.setRow(j,E.getRow(k));
                    continue;
                }
            }
        }
    }
    for(j=0;j<n;j++) {
        x = E.getRow(j);
        E.setRow(j,x.div(x.norm2()));
    }
    E = E.transpose();
    E = Q.transjugate().dot(E);
    return { lambda:R.getDiag(), E:E };
};

// 5. Compressed Column Storage matrices
numeric.ccsSparse = function ccsSparse(A) {
    var m = A.length,n,foo, i,j, counts = [];
    for(i=m-1;i!==-1;--i) {
        foo = A[i];
        for(j in foo) {
            j = parseInt(j);
            while(j>=counts.length) counts[counts.length] = 0;
            if(foo[j]!==0) counts[j]++;
        }
    }
    var n = counts.length;
    var Ai = Array(n+1);
    Ai[0] = 0;
    for(i=0;i<n;++i) Ai[i+1] = Ai[i] + counts[i];
    var Aj = Array(Ai[n]), Av = Array(Ai[n]);
    for(i=m-1;i!==-1;--i) {
        foo = A[i];
        for(j in foo) {
            if(foo[j]!==0) {
                counts[j]--;
                Aj[Ai[j]+counts[j]] = i;
                Av[Ai[j]+counts[j]] = foo[j];
            }
        }
    }
    return [Ai,Aj,Av];
}
numeric.ccsFull = function ccsFull(A) {
    var Ai = A[0], Aj = A[1], Av = A[2], s = numeric.ccsDim(A), m = s[0], n = s[1], i,j,j0,j1,k;
    var B = numeric.rep([m,n],0);
    for(i=0;i<n;i++) {
        j0 = Ai[i];
        j1 = Ai[i+1];
        for(j=j0;j<j1;++j) { B[Aj[j]][i] = Av[j]; }
    }
    return B;
}
numeric.ccsTSolve = function ccsTSolve(A,b,x,bj,xj) {
    var Ai = A[0], Aj = A[1], Av = A[2],m = Ai.length-1, max = Math.max,n=0;
    if(typeof bj === "undefined") x = numeric.rep([m],0);
    if(typeof bj === "undefined") bj = numeric.linspace(0,x.length-1);
    if(typeof xj === "undefined") xj = [];
    function dfs(j) {
        var k;
        if(x[j] !== 0) return;
        x[j] = 1;
        for(k=Ai[j];k<Ai[j+1];++k) dfs(Aj[k]);
        xj[n] = j;
        ++n;
    }
    var i,j,j0,j1,k,l,l0,l1,a;
    for(i=bj.length-1;i!==-1;--i) { dfs(bj[i]); }
    xj.length = n;
    for(i=xj.length-1;i!==-1;--i) { x[xj[i]] = 0; }
    for(i=bj.length-1;i!==-1;--i) { j = bj[i]; x[j] = b[j]; }
    for(i=xj.length-1;i!==-1;--i) {
        j = xj[i];
        j0 = Ai[j];
        j1 = max(Ai[j+1],j0);
        for(k=j0;k!==j1;++k) { if(Aj[k] === j) { x[j] /= Av[k]; break; } }
        a = x[j];
        for(k=j0;k!==j1;++k) {
            l = Aj[k];
            if(l !== j) x[l] -= a*Av[k];
        }
    }
    return x;
}
numeric.ccsDFS = function ccsDFS(n) {
    this.k = Array(n);
    this.k1 = Array(n);
    this.j = Array(n);
}
numeric.ccsDFS.prototype.dfs = function dfs(J,Ai,Aj,x,xj,Pinv) {
    var m = 0,foo,n=xj.length;
    var k = this.k, k1 = this.k1, j = this.j,km,k11;
    if(x[J]!==0) return;
    x[J] = 1;
    j[0] = J;
    k[0] = km = Ai[J];
    k1[0] = k11 = Ai[J+1];
    while(1) {
        if(km >= k11) {
            xj[n] = j[m];
            if(m===0) return;
            ++n;
            --m;
            km = k[m];
            k11 = k1[m];
        } else {
            foo = Pinv[Aj[km]];
            if(x[foo] === 0) {
                x[foo] = 1;
                k[m] = km;
                ++m;
                j[m] = foo;
                km = Ai[foo];
                k1[m] = k11 = Ai[foo+1];
            } else ++km;
        }
    }
}
numeric.ccsLPSolve = function ccsLPSolve(A,B,x,xj,I,Pinv,dfs) {
    var Ai = A[0], Aj = A[1], Av = A[2],m = Ai.length-1, n=0;
    var Bi = B[0], Bj = B[1], Bv = B[2];
    
    var i,i0,i1,j,J,j0,j1,k,l,l0,l1,a;
    i0 = Bi[I];
    i1 = Bi[I+1];
    xj.length = 0;
    for(i=i0;i<i1;++i) { dfs.dfs(Pinv[Bj[i]],Ai,Aj,x,xj,Pinv); }
    for(i=xj.length-1;i!==-1;--i) { x[xj[i]] = 0; }
    for(i=i0;i!==i1;++i) { j = Pinv[Bj[i]]; x[j] = Bv[i]; }
    for(i=xj.length-1;i!==-1;--i) {
        j = xj[i];
        j0 = Ai[j];
        j1 = Ai[j+1];
        for(k=j0;k<j1;++k) { if(Pinv[Aj[k]] === j) { x[j] /= Av[k]; break; } }
        a = x[j];
        for(k=j0;k<j1;++k) {
            l = Pinv[Aj[k]];
            if(l !== j) x[l] -= a*Av[k];
        }
    }
    return x;
}
numeric.ccsLUP1 = function ccsLUP1(A,threshold) {
    var m = A[0].length-1;
    var L = [numeric.rep([m+1],0),[],[]], U = [numeric.rep([m+1], 0),[],[]];
    var Li = L[0], Lj = L[1], Lv = L[2], Ui = U[0], Uj = U[1], Uv = U[2];
    var x = numeric.rep([m],0), xj = numeric.rep([m],0);
    var i,j,k,j0,j1,a,e,c,d,K;
    var sol = numeric.ccsLPSolve, max = Math.max, abs = Math.abs;
    var P = numeric.linspace(0,m-1),Pinv = numeric.linspace(0,m-1);
    var dfs = new numeric.ccsDFS(m);
    if(typeof threshold === "undefined") { threshold = 1; }
    for(i=0;i<m;++i) {
        sol(L,A,x,xj,i,Pinv,dfs);
        a = -1;
        e = -1;
        for(j=xj.length-1;j!==-1;--j) {
            k = xj[j];
            if(k <= i) continue;
            c = abs(x[k]);
            if(c > a) { e = k; a = c; }
        }
        if(abs(x[i])<threshold*a) {
            j = P[i];
            a = P[e];
            P[i] = a; Pinv[a] = i;
            P[e] = j; Pinv[j] = e;
            a = x[i]; x[i] = x[e]; x[e] = a;
        }
        a = Li[i];
        e = Ui[i];
        d = x[i];
        Lj[a] = P[i];
        Lv[a] = 1;
        ++a;
        for(j=xj.length-1;j!==-1;--j) {
            k = xj[j];
            c = x[k];
            xj[j] = 0;
            x[k] = 0;
            if(k<=i) { Uj[e] = k; Uv[e] = c;   ++e; }
            else     { Lj[a] = P[k]; Lv[a] = c/d; ++a; }
        }
        Li[i+1] = a;
        Ui[i+1] = e;
    }
    for(j=Lj.length-1;j!==-1;--j) { Lj[j] = Pinv[Lj[j]]; }
    return {L:L, U:U, P:P, Pinv:Pinv};
}
numeric.ccsDFS0 = function ccsDFS0(n) {
    this.k = Array(n);
    this.k1 = Array(n);
    this.j = Array(n);
}
numeric.ccsDFS0.prototype.dfs = function dfs(J,Ai,Aj,x,xj,Pinv,P) {
    var m = 0,foo,n=xj.length;
    var k = this.k, k1 = this.k1, j = this.j,km,k11;
    if(x[J]!==0) return;
    x[J] = 1;
    j[0] = J;
    k[0] = km = Ai[Pinv[J]];
    k1[0] = k11 = Ai[Pinv[J]+1];
    while(1) {
        if(isNaN(km)) throw new Error("Ow!");
        if(km >= k11) {
            xj[n] = Pinv[j[m]];
            if(m===0) return;
            ++n;
            --m;
            km = k[m];
            k11 = k1[m];
        } else {
            foo = Aj[km];
            if(x[foo] === 0) {
                x[foo] = 1;
                k[m] = km;
                ++m;
                j[m] = foo;
                foo = Pinv[foo];
                km = Ai[foo];
                k1[m] = k11 = Ai[foo+1];
            } else ++km;
        }
    }
}
numeric.ccsLPSolve0 = function ccsLPSolve0(A,B,y,xj,I,Pinv,P,dfs) {
    var Ai = A[0], Aj = A[1], Av = A[2],m = Ai.length-1, n=0;
    var Bi = B[0], Bj = B[1], Bv = B[2];
    
    var i,i0,i1,j,J,j0,j1,k,l,l0,l1,a;
    i0 = Bi[I];
    i1 = Bi[I+1];
    xj.length = 0;
    for(i=i0;i<i1;++i) { dfs.dfs(Bj[i],Ai,Aj,y,xj,Pinv,P); }
    for(i=xj.length-1;i!==-1;--i) { j = xj[i]; y[P[j]] = 0; }
    for(i=i0;i!==i1;++i) { j = Bj[i]; y[j] = Bv[i]; }
    for(i=xj.length-1;i!==-1;--i) {
        j = xj[i];
        l = P[j];
        j0 = Ai[j];
        j1 = Ai[j+1];
        for(k=j0;k<j1;++k) { if(Aj[k] === l) { y[l] /= Av[k]; break; } }
        a = y[l];
        for(k=j0;k<j1;++k) y[Aj[k]] -= a*Av[k];
        y[l] = a;
    }
}
numeric.ccsLUP0 = function ccsLUP0(A,threshold) {
    var m = A[0].length-1;
    var L = [numeric.rep([m+1],0),[],[]], U = [numeric.rep([m+1], 0),[],[]];
    var Li = L[0], Lj = L[1], Lv = L[2], Ui = U[0], Uj = U[1], Uv = U[2];
    var y = numeric.rep([m],0), xj = numeric.rep([m],0);
    var i,j,k,j0,j1,a,e,c,d,K;
    var sol = numeric.ccsLPSolve0, max = Math.max, abs = Math.abs;
    var P = numeric.linspace(0,m-1),Pinv = numeric.linspace(0,m-1);
    var dfs = new numeric.ccsDFS0(m);
    if(typeof threshold === "undefined") { threshold = 1; }
    for(i=0;i<m;++i) {
        sol(L,A,y,xj,i,Pinv,P,dfs);
        a = -1;
        e = -1;
        for(j=xj.length-1;j!==-1;--j) {
            k = xj[j];
            if(k <= i) continue;
            c = abs(y[P[k]]);
            if(c > a) { e = k; a = c; }
        }
        if(abs(y[P[i]])<threshold*a) {
            j = P[i];
            a = P[e];
            P[i] = a; Pinv[a] = i;
            P[e] = j; Pinv[j] = e;
        }
        a = Li[i];
        e = Ui[i];
        d = y[P[i]];
        Lj[a] = P[i];
        Lv[a] = 1;
        ++a;
        for(j=xj.length-1;j!==-1;--j) {
            k = xj[j];
            c = y[P[k]];
            xj[j] = 0;
            y[P[k]] = 0;
            if(k<=i) { Uj[e] = k; Uv[e] = c;   ++e; }
            else     { Lj[a] = P[k]; Lv[a] = c/d; ++a; }
        }
        Li[i+1] = a;
        Ui[i+1] = e;
    }
    for(j=Lj.length-1;j!==-1;--j) { Lj[j] = Pinv[Lj[j]]; }
    return {L:L, U:U, P:P, Pinv:Pinv};
}
numeric.ccsLUP = numeric.ccsLUP0;

numeric.ccsDim = function ccsDim(A) { return [numeric.sup(A[1])+1,A[0].length-1]; }
numeric.ccsGetBlock = function ccsGetBlock(A,i,j) {
    var s = numeric.ccsDim(A),m=s[0],n=s[1];
    if(typeof i === "undefined") { i = numeric.linspace(0,m-1); }
    else if(typeof i === "number") { i = [i]; }
    if(typeof j === "undefined") { j = numeric.linspace(0,n-1); }
    else if(typeof j === "number") { j = [j]; }
    var p,p0,p1,P = i.length,q,Q = j.length,r,jq,ip;
    var Bi = numeric.rep([n],0), Bj=[], Bv=[], B = [Bi,Bj,Bv];
    var Ai = A[0], Aj = A[1], Av = A[2];
    var x = numeric.rep([m],0),count=0,flags = numeric.rep([m],0);
    for(q=0;q<Q;++q) {
        jq = j[q];
        var q0 = Ai[jq];
        var q1 = Ai[jq+1];
        for(p=q0;p<q1;++p) {
            r = Aj[p];
            flags[r] = 1;
            x[r] = Av[p];
        }
        for(p=0;p<P;++p) {
            ip = i[p];
            if(flags[ip]) {
                Bj[count] = p;
                Bv[count] = x[i[p]];
                ++count;
            }
        }
        for(p=q0;p<q1;++p) {
            r = Aj[p];
            flags[r] = 0;
        }
        Bi[q+1] = count;
    }
    return B;
}

numeric.ccsDot = function ccsDot(A,B) {
    var Ai = A[0], Aj = A[1], Av = A[2];
    var Bi = B[0], Bj = B[1], Bv = B[2];
    var sA = numeric.ccsDim(A), sB = numeric.ccsDim(B);
    var m = sA[0], n = sA[1], o = sB[1];
    var x = numeric.rep([m],0), flags = numeric.rep([m],0), xj = Array(m);
    var Ci = numeric.rep([o],0), Cj = [], Cv = [], C = [Ci,Cj,Cv];
    var i,j,k,j0,j1,i0,i1,l,p,a,b;
    for(k=0;k!==o;++k) {
        j0 = Bi[k];
        j1 = Bi[k+1];
        p = 0;
        for(j=j0;j<j1;++j) {
            a = Bj[j];
            b = Bv[j];
            i0 = Ai[a];
            i1 = Ai[a+1];
            for(i=i0;i<i1;++i) {
                l = Aj[i];
                if(flags[l]===0) {
                    xj[p] = l;
                    flags[l] = 1;
                    p = p+1;
                }
                x[l] = x[l] + Av[i]*b;
            }
        }
        j0 = Ci[k];
        j1 = j0+p;
        Ci[k+1] = j1;
        for(j=p-1;j!==-1;--j) {
            b = j0+j;
            i = xj[j];
            Cj[b] = i;
            Cv[b] = x[i];
            flags[i] = 0;
            x[i] = 0;
        }
        Ci[k+1] = Ci[k]+p;
    }
    return C;
}

numeric.ccsLUPSolve = function ccsLUPSolve(LUP,B) {
    var L = LUP.L, U = LUP.U, P = LUP.P;
    var Bi = B[0];
    var flag = false;
    if(typeof Bi !== "object") { B = [[0,B.length],numeric.linspace(0,B.length-1),B]; Bi = B[0]; flag = true; }
    var Bj = B[1], Bv = B[2];
    var n = L[0].length-1, m = Bi.length-1;
    var x = numeric.rep([n],0), xj = Array(n);
    var b = numeric.rep([n],0), bj = Array(n);
    var Xi = numeric.rep([m+1],0), Xj = [], Xv = [];
    var sol = numeric.ccsTSolve;
    var i,j,j0,j1,k,J,N=0;
    for(i=0;i<m;++i) {
        k = 0;
        j0 = Bi[i];
        j1 = Bi[i+1];
        for(j=j0;j<j1;++j) { 
            J = LUP.Pinv[Bj[j]];
            bj[k] = J;
            b[J] = Bv[j];
            ++k;
        }
        bj.length = k;
        sol(L,b,x,bj,xj);
        for(j=bj.length-1;j!==-1;--j) b[bj[j]] = 0;
        sol(U,x,b,xj,bj);
        if(flag) return b;
        for(j=xj.length-1;j!==-1;--j) x[xj[j]] = 0;
        for(j=bj.length-1;j!==-1;--j) {
            J = bj[j];
            Xj[N] = J;
            Xv[N] = b[J];
            b[J] = 0;
            ++N;
        }
        Xi[i+1] = N;
    }
    return [Xi,Xj,Xv];
}

numeric.ccsbinop = function ccsbinop(body,setup) {
    if(typeof setup === "undefined") setup='';
    return numeric.compile('X','Y',
            'var Xi = X[0], Xj = X[1], Xv = X[2];\n'+
            'var Yi = Y[0], Yj = Y[1], Yv = Y[2];\n'+
            'var n = Xi.length-1,m = Math.max(numeric.sup(Xj),numeric.sup(Yj))+1;\n'+
            'var Zi = numeric.rep([n+1],0), Zj = [], Zv = [];\n'+
            'var x = numeric.rep([m],0),y = numeric.rep([m],0);\n'+
            'var xk,yk,zk;\n'+
            'var i,j,j0,j1,k,p=0;\n'+
            setup+
            'for(i=0;i<n;++i) {\n'+
            '  j0 = Xi[i]; j1 = Xi[i+1];\n'+
            '  for(j=j0;j!==j1;++j) {\n'+
            '    k = Xj[j];\n'+
            '    x[k] = 1;\n'+
            '    Zj[p] = k;\n'+
            '    ++p;\n'+
            '  }\n'+
            '  j0 = Yi[i]; j1 = Yi[i+1];\n'+
            '  for(j=j0;j!==j1;++j) {\n'+
            '    k = Yj[j];\n'+
            '    y[k] = Yv[j];\n'+
            '    if(x[k] === 0) {\n'+
            '      Zj[p] = k;\n'+
            '      ++p;\n'+
            '    }\n'+
            '  }\n'+
            '  Zi[i+1] = p;\n'+
            '  j0 = Xi[i]; j1 = Xi[i+1];\n'+
            '  for(j=j0;j!==j1;++j) x[Xj[j]] = Xv[j];\n'+
            '  j0 = Zi[i]; j1 = Zi[i+1];\n'+
            '  for(j=j0;j!==j1;++j) {\n'+
            '    k = Zj[j];\n'+
            '    xk = x[k];\n'+
            '    yk = y[k];\n'+
            body+'\n'+
            '    Zv[j] = zk;\n'+
            '  }\n'+
            '  j0 = Xi[i]; j1 = Xi[i+1];\n'+
            '  for(j=j0;j!==j1;++j) x[Xj[j]] = 0;\n'+
            '  j0 = Yi[i]; j1 = Yi[i+1];\n'+
            '  for(j=j0;j!==j1;++j) y[Yj[j]] = 0;\n'+
            '}\n'+
            'return [Zi,Zj,Zv];'
            );
};

(function() {
    var k,A,B,C;
    for(k in numeric.ops2) {
        if(isFinite(eval('1'+numeric.ops2[k]+'0'))) A = '[Y[0],Y[1],numeric.'+k+'(X,Y[2])]';
        else A = 'NaN';
        if(isFinite(eval('0'+numeric.ops2[k]+'1'))) B = '[X[0],X[1],numeric.'+k+'(X[2],Y)]';
        else B = 'NaN';
        if(isFinite(eval('1'+numeric.ops2[k]+'0')) && isFinite(eval('0'+numeric.ops2[k]+'1'))) C = 'numeric.ccs'+k+'MM(X,Y)';
        else C = 'NaN';
        numeric['ccs'+k+'MM'] = numeric.ccsbinop('zk = xk '+numeric.ops2[k]+'yk;');
        numeric['ccs'+k] = numeric.compile('X','Y',
                'if(typeof X === "number") return '+A+';\n'+
                'if(typeof Y === "number") return '+B+';\n'+
                'return '+C+';\n'
                );
    }
}());

numeric.ccsScatter = function ccsScatter(A) {
    var Ai = A[0], Aj = A[1], Av = A[2];
    var n = numeric.sup(Aj)+1,m=Ai.length;
    var Ri = numeric.rep([n],0),Rj=Array(m), Rv = Array(m);
    var counts = numeric.rep([n],0),i;
    for(i=0;i<m;++i) counts[Aj[i]]++;
    for(i=0;i<n;++i) Ri[i+1] = Ri[i] + counts[i];
    var ptr = Ri.slice(0),k,Aii;
    for(i=0;i<m;++i) {
        Aii = Aj[i];
        k = ptr[Aii];
        Rj[k] = Ai[i];
        Rv[k] = Av[i];
        ptr[Aii]=ptr[Aii]+1;
    }
    return [Ri,Rj,Rv];
}

numeric.ccsGather = function ccsGather(A) {
    var Ai = A[0], Aj = A[1], Av = A[2];
    var n = Ai.length-1,m = Aj.length;
    var Ri = Array(m), Rj = Array(m), Rv = Array(m);
    var i,j,j0,j1,p;
    p=0;
    for(i=0;i<n;++i) {
        j0 = Ai[i];
        j1 = Ai[i+1];
        for(j=j0;j!==j1;++j) {
            Rj[p] = i;
            Ri[p] = Aj[j];
            Rv[p] = Av[j];
            ++p;
        }
    }
    return [Ri,Rj,Rv];
}

// The following sparse linear algebra routines are deprecated.

numeric.sdim = function dim(A,ret,k) {
    if(typeof ret === "undefined") { ret = []; }
    if(typeof A !== "object") return ret;
    if(typeof k === "undefined") { k=0; }
    if(!(k in ret)) { ret[k] = 0; }
    if(A.length > ret[k]) ret[k] = A.length;
    var i;
    for(i in A) {
        if(A.hasOwnProperty(i)) dim(A[i],ret,k+1);
    }
    return ret;
};

numeric.sclone = function clone(A,k,n) {
    if(typeof k === "undefined") { k=0; }
    if(typeof n === "undefined") { n = numeric.sdim(A).length; }
    var i,ret = Array(A.length);
    if(k === n-1) {
        for(i in A) { if(A.hasOwnProperty(i)) ret[i] = A[i]; }
        return ret;
    }
    for(i in A) {
        if(A.hasOwnProperty(i)) ret[i] = clone(A[i],k+1,n);
    }
    return ret;
}

numeric.sdiag = function diag(d) {
    var n = d.length,i,ret = Array(n),i1,i2,i3;
    for(i=n-1;i>=1;i-=2) {
        i1 = i-1;
        ret[i] = []; ret[i][i] = d[i];
        ret[i1] = []; ret[i1][i1] = d[i1];
    }
    if(i===0) { ret[0] = []; ret[0][0] = d[i]; }
    return ret;
}

numeric.sidentity = function identity(n) { return numeric.sdiag(numeric.rep([n],1)); }

numeric.stranspose = function transpose(A) {
    var ret = [], n = A.length, i,j,Ai;
    for(i in A) {
        if(!(A.hasOwnProperty(i))) continue;
        Ai = A[i];
        for(j in Ai) {
            if(!(Ai.hasOwnProperty(j))) continue;
            if(typeof ret[j] !== "object") { ret[j] = []; }
            ret[j][i] = Ai[j];
        }
    }
    return ret;
}

numeric.sLUP = function LUP(A,tol) {
    throw new Error("The function numeric.sLUP had a bug in it and has been removed. Please use the new numeric.ccsLUP function instead.");
};

numeric.sdotMM = function dotMM(A,B) {
    var p = A.length, q = B.length, BT = numeric.stranspose(B), r = BT.length, Ai, BTk;
    var i,j,k,accum;
    var ret = Array(p),reti;
    for(i=p-1;i>=0;i--) {
        reti = [];
        Ai = A[i];
        for(k=r-1;k>=0;k--) {
            accum = 0;
            BTk = BT[k];
            for(j in Ai) {
                if(!(Ai.hasOwnProperty(j))) continue;
                if(j in BTk) { accum += Ai[j]*BTk[j]; }
            }
            if(accum) reti[k] = accum;
        }
        ret[i] = reti;
    }
    return ret;
}

numeric.sdotMV = function dotMV(A,x) {
    var p = A.length, Ai, i,j;
    var ret = Array(p), accum;
    for(i=p-1;i>=0;i--) {
        Ai = A[i];
        accum = 0;
        for(j in Ai) {
            if(!(Ai.hasOwnProperty(j))) continue;
            if(x[j]) accum += Ai[j]*x[j];
        }
        if(accum) ret[i] = accum;
    }
    return ret;
}

numeric.sdotVM = function dotMV(x,A) {
    var i,j,Ai,alpha;
    var ret = [], accum;
    for(i in x) {
        if(!x.hasOwnProperty(i)) continue;
        Ai = A[i];
        alpha = x[i];
        for(j in Ai) {
            if(!Ai.hasOwnProperty(j)) continue;
            if(!ret[j]) { ret[j] = 0; }
            ret[j] += alpha*Ai[j];
        }
    }
    return ret;
}

numeric.sdotVV = function dotVV(x,y) {
    var i,ret=0;
    for(i in x) { if(x[i] && y[i]) ret+= x[i]*y[i]; }
    return ret;
}

numeric.sdot = function dot(A,B) {
    var m = numeric.sdim(A).length, n = numeric.sdim(B).length;
    var k = m*1000+n;
    switch(k) {
    case 0: return A*B;
    case 1001: return numeric.sdotVV(A,B);
    case 2001: return numeric.sdotMV(A,B);
    case 1002: return numeric.sdotVM(A,B);
    case 2002: return numeric.sdotMM(A,B);
    default: throw new Error('numeric.sdot not implemented for tensors of order '+m+' and '+n);
    }
}

numeric.sscatter = function scatter(V) {
    var n = V[0].length, Vij, i, j, m = V.length, A = [], Aj;
    for(i=n-1;i>=0;--i) {
        if(!V[m-1][i]) continue;
        Aj = A;
        for(j=0;j<m-2;j++) {
            Vij = V[j][i];
            if(!Aj[Vij]) Aj[Vij] = [];
            Aj = Aj[Vij];
        }
        Aj[V[j][i]] = V[j+1][i];
    }
    return A;
}

numeric.sgather = function gather(A,ret,k) {
    if(typeof ret === "undefined") ret = [];
    if(typeof k === "undefined") k = [];
    var n,i,Ai;
    n = k.length;
    for(i in A) {
        if(A.hasOwnProperty(i)) {
            k[n] = parseInt(i);
            Ai = A[i];
            if(typeof Ai === "number") {
                if(Ai) {
                    if(ret.length === 0) {
                        for(i=n+1;i>=0;--i) ret[i] = [];
                    }
                    for(i=n;i>=0;--i) ret[i].push(k[i]);
                    ret[n+1].push(Ai);
                }
            } else gather(Ai,ret,k);
        }
    }
    if(k.length>n) k.pop();
    return ret;
}

// 6. Coordinate matrices
numeric.cLU = function LU(A) {
    var I = A[0], J = A[1], V = A[2];
    var p = I.length, m=0, i,j,k,a,b,c;
    for(i=0;i<p;i++) if(I[i]>m) m=I[i];
    m++;
    var L = Array(m), U = Array(m), left = numeric.rep([m],Infinity), right = numeric.rep([m],-Infinity);
    var Ui, Uj,alpha;
    for(k=0;k<p;k++) {
        i = I[k];
        j = J[k];
        if(j<left[i]) left[i] = j;
        if(j>right[i]) right[i] = j;
    }
    for(i=0;i<m-1;i++) { if(right[i] > right[i+1]) right[i+1] = right[i]; }
    for(i=m-1;i>=1;i--) { if(left[i]<left[i-1]) left[i-1] = left[i]; }
    var countL = 0, countU = 0;
    for(i=0;i<m;i++) {
        U[i] = numeric.rep([right[i]-left[i]+1],0);
        L[i] = numeric.rep([i-left[i]],0);
        countL += i-left[i]+1;
        countU += right[i]-i+1;
    }
    for(k=0;k<p;k++) { i = I[k]; U[i][J[k]-left[i]] = V[k]; }
    for(i=0;i<m-1;i++) {
        a = i-left[i];
        Ui = U[i];
        for(j=i+1;left[j]<=i && j<m;j++) {
            b = i-left[j];
            c = right[i]-i;
            Uj = U[j];
            alpha = Uj[b]/Ui[a];
            if(alpha) {
                for(k=1;k<=c;k++) { Uj[k+b] -= alpha*Ui[k+a]; }
                L[j][i-left[j]] = alpha;
            }
        }
    }
    var Ui = [], Uj = [], Uv = [], Li = [], Lj = [], Lv = [];
    var p,q,foo;
    p=0; q=0;
    for(i=0;i<m;i++) {
        a = left[i];
        b = right[i];
        foo = U[i];
        for(j=i;j<=b;j++) {
            if(foo[j-a]) {
                Ui[p] = i;
                Uj[p] = j;
                Uv[p] = foo[j-a];
                p++;
            }
        }
        foo = L[i];
        for(j=a;j<i;j++) {
            if(foo[j-a]) {
                Li[q] = i;
                Lj[q] = j;
                Lv[q] = foo[j-a];
                q++;
            }
        }
        Li[q] = i;
        Lj[q] = i;
        Lv[q] = 1;
        q++;
    }
    return {U:[Ui,Uj,Uv], L:[Li,Lj,Lv]};
};

numeric.cLUsolve = function LUsolve(lu,b) {
    var L = lu.L, U = lu.U, ret = numeric.clone(b);
    var Li = L[0], Lj = L[1], Lv = L[2];
    var Ui = U[0], Uj = U[1], Uv = U[2];
    var p = Ui.length, q = Li.length;
    var m = ret.length,i,j,k;
    k = 0;
    for(i=0;i<m;i++) {
        while(Lj[k] < i) {
            ret[i] -= Lv[k]*ret[Lj[k]];
            k++;
        }
        k++;
    }
    k = p-1;
    for(i=m-1;i>=0;i--) {
        while(Uj[k] > i) {
            ret[i] -= Uv[k]*ret[Uj[k]];
            k--;
        }
        ret[i] /= Uv[k];
        k--;
    }
    return ret;
};

numeric.cgrid = function grid(n,shape) {
    if(typeof n === "number") n = [n,n];
    var ret = numeric.rep(n,-1);
    var i,j,count;
    if(typeof shape !== "function") {
        switch(shape) {
        case 'L':
            shape = function(i,j) { return (i>=n[0]/2 || j<n[1]/2); }
            break;
        default:
            shape = function(i,j) { return true; };
            break;
        }
    }
    count=0;
    for(i=1;i<n[0]-1;i++) for(j=1;j<n[1]-1;j++) 
        if(shape(i,j)) {
            ret[i][j] = count;
            count++;
        }
    return ret;
}

numeric.cdelsq = function delsq(g) {
    var dir = [[-1,0],[0,-1],[0,1],[1,0]];
    var s = numeric.dim(g), m = s[0], n = s[1], i,j,k,p,q;
    var Li = [], Lj = [], Lv = [];
    for(i=1;i<m-1;i++) for(j=1;j<n-1;j++) {
        if(g[i][j]<0) continue;
        for(k=0;k<4;k++) {
            p = i+dir[k][0];
            q = j+dir[k][1];
            if(g[p][q]<0) continue;
            Li.push(g[i][j]);
            Lj.push(g[p][q]);
            Lv.push(-1);
        }
        Li.push(g[i][j]);
        Lj.push(g[i][j]);
        Lv.push(4);
    }
    return [Li,Lj,Lv];
}

numeric.cdotMV = function dotMV(A,x) {
    var ret, Ai = A[0], Aj = A[1], Av = A[2],k,p=Ai.length,N;
    N=0;
    for(k=0;k<p;k++) { if(Ai[k]>N) N = Ai[k]; }
    N++;
    ret = numeric.rep([N],0);
    for(k=0;k<p;k++) { ret[Ai[k]]+=Av[k]*x[Aj[k]]; }
    return ret;
}

// 7. Splines

numeric.Spline = function Spline(x,yl,yr,kl,kr) { this.x = x; this.yl = yl; this.yr = yr; this.kl = kl; this.kr = kr; }
numeric.Spline.prototype._at = function _at(x1,p) {
    var x = this.x;
    var yl = this.yl;
    var yr = this.yr;
    var kl = this.kl;
    var kr = this.kr;
    var x1,a,b,t;
    var add = numeric.add, sub = numeric.sub, mul = numeric.mul;
    a = sub(mul(kl[p],x[p+1]-x[p]),sub(yr[p+1],yl[p]));
    b = add(mul(kr[p+1],x[p]-x[p+1]),sub(yr[p+1],yl[p]));
    t = (x1-x[p])/(x[p+1]-x[p]);
    var s = t*(1-t);
    return add(add(add(mul(1-t,yl[p]),mul(t,yr[p+1])),mul(a,s*(1-t))),mul(b,s*t));
}
numeric.Spline.prototype.at = function at(x0) {
    if(typeof x0 === "number") {
        var x = this.x;
        var n = x.length;
        var p,q,mid,floor = Math.floor,a,b,t;
        p = 0;
        q = n-1;
        while(q-p>1) {
            mid = floor((p+q)/2);
            if(x[mid] <= x0) p = mid;
            else q = mid;
        }
        return this._at(x0,p);
    }
    var n = x0.length, i, ret = Array(n);
    for(i=n-1;i!==-1;--i) ret[i] = this.at(x0[i]);
    return ret;
}
numeric.Spline.prototype.diff = function diff() {
    var x = this.x;
    var yl = this.yl;
    var yr = this.yr;
    var kl = this.kl;
    var kr = this.kr;
    var n = yl.length;
    var i,dx,dy;
    var zl = kl, zr = kr, pl = Array(n), pr = Array(n);
    var add = numeric.add, mul = numeric.mul, div = numeric.div, sub = numeric.sub;
    for(i=n-1;i!==-1;--i) {
        dx = x[i+1]-x[i];
        dy = sub(yr[i+1],yl[i]);
        pl[i] = div(add(mul(dy, 6),mul(kl[i],-4*dx),mul(kr[i+1],-2*dx)),dx*dx);
        pr[i+1] = div(add(mul(dy,-6),mul(kl[i], 2*dx),mul(kr[i+1], 4*dx)),dx*dx);
    }
    return new numeric.Spline(x,zl,zr,pl,pr);
}
numeric.Spline.prototype.roots = function roots() {
    function sqr(x) { return x*x; }
    function heval(y0,y1,k0,k1,x) {
        var A = k0*2-(y1-y0);
        var B = -k1*2+(y1-y0);
        var t = (x+1)*0.5;
        var s = t*(1-t);
        return (1-t)*y0+t*y1+A*s*(1-t)+B*s*t;
    }
    var ret = [];
    var x = this.x, yl = this.yl, yr = this.yr, kl = this.kl, kr = this.kr;
    if(typeof yl[0] === "number") {
        yl = [yl];
        yr = [yr];
        kl = [kl];
        kr = [kr];
    }
    var m = yl.length,n=x.length-1,i,j,k,y,s,t;
    var ai,bi,ci,di, ret = Array(m),ri,k0,k1,y0,y1,A,B,D,dx,cx,stops,z0,z1,zm,t0,t1,tm;
    var sqrt = Math.sqrt;
    for(i=0;i!==m;++i) {
        ai = yl[i];
        bi = yr[i];
        ci = kl[i];
        di = kr[i];
        ri = [];
        for(j=0;j!==n;j++) {
            if(j>0 && bi[j]*ai[j]<0) ri.push(x[j]);
            dx = (x[j+1]-x[j]);
            cx = x[j];
            y0 = ai[j];
            y1 = bi[j+1];
            k0 = ci[j]/dx;
            k1 = di[j+1]/dx;
            D = sqr(k0-k1+3*(y0-y1)) + 12*k1*y0;
            A = k1+3*y0+2*k0-3*y1;
            B = 3*(k1+k0+2*(y0-y1));
            if(D<=0) {
                z0 = A/B;
                if(z0>x[j] && z0<x[j+1]) stops = [x[j],z0,x[j+1]];
                else stops = [x[j],x[j+1]];
            } else {
                z0 = (A-sqrt(D))/B;
                z1 = (A+sqrt(D))/B;
                stops = [x[j]];
                if(z0>x[j] && z0<x[j+1]) stops.push(z0);
                if(z1>x[j] && z1<x[j+1]) stops.push(z1);
                stops.push(x[j+1]);
            }
            t0 = stops[0];
            z0 = this._at(t0,j);
            for(k=0;k<stops.length-1;k++) {
                t1 = stops[k+1];
                z1 = this._at(t1,j);
                if(z0 === 0) {
                    ri.push(t0); 
                    t0 = t1;
                    z0 = z1;
                    continue;
                }
                if(z1 === 0 || z0*z1>0) {
                    t0 = t1;
                    z0 = z1;
                    continue;
                }
                var side = 0;
                while(1) {
                    tm = (z0*t1-z1*t0)/(z0-z1);
                    if(tm <= t0 || tm >= t1) { break; }
                    zm = this._at(tm,j);
                    if(zm*z1>0) {
                        t1 = tm;
                        z1 = zm;
                        if(side === -1) z0*=0.5;
                        side = -1;
                    } else if(zm*z0>0) {
                        t0 = tm;
                        z0 = zm;
                        if(side === 1) z1*=0.5;
                        side = 1;
                    } else break;
                }
                ri.push(tm);
                t0 = stops[k+1];
                z0 = this._at(t0, j);
            }
            if(z1 === 0) ri.push(t1);
        }
        ret[i] = ri;
    }
    if(typeof this.yl[0] === "number") return ret[0];
    return ret;
}
numeric.spline = function spline(x,y,k1,kn) {
    var n = x.length, b = [], dx = [], dy = [];
    var i;
    var sub = numeric.sub,mul = numeric.mul,add = numeric.add;
    for(i=n-2;i>=0;i--) { dx[i] = x[i+1]-x[i]; dy[i] = sub(y[i+1],y[i]); }
    if(typeof k1 === "string" || typeof kn === "string") { 
        k1 = kn = "periodic";
    }
    // Build sparse tridiagonal system
    var T = [[],[],[]];
    switch(typeof k1) {
    case "undefined":
        b[0] = mul(3/(dx[0]*dx[0]),dy[0]);
        T[0].push(0,0);
        T[1].push(0,1);
        T[2].push(2/dx[0],1/dx[0]);
        break;
    case "string":
        b[0] = add(mul(3/(dx[n-2]*dx[n-2]),dy[n-2]),mul(3/(dx[0]*dx[0]),dy[0]));
        T[0].push(0,0,0);
        T[1].push(n-2,0,1);
        T[2].push(1/dx[n-2],2/dx[n-2]+2/dx[0],1/dx[0]);
        break;
    default:
        b[0] = k1;
        T[0].push(0);
        T[1].push(0);
        T[2].push(1);
        break;
    }
    for(i=1;i<n-1;i++) {
        b[i] = add(mul(3/(dx[i-1]*dx[i-1]),dy[i-1]),mul(3/(dx[i]*dx[i]),dy[i]));
        T[0].push(i,i,i);
        T[1].push(i-1,i,i+1);
        T[2].push(1/dx[i-1],2/dx[i-1]+2/dx[i],1/dx[i]);
    }
    switch(typeof kn) {
    case "undefined":
        b[n-1] = mul(3/(dx[n-2]*dx[n-2]),dy[n-2]);
        T[0].push(n-1,n-1);
        T[1].push(n-2,n-1);
        T[2].push(1/dx[n-2],2/dx[n-2]);
        break;
    case "string":
        T[1][T[1].length-1] = 0;
        break;
    default:
        b[n-1] = kn;
        T[0].push(n-1);
        T[1].push(n-1);
        T[2].push(1);
        break;
    }
    if(typeof b[0] !== "number") b = numeric.transpose(b);
    else b = [b];
    var k = Array(b.length);
    if(typeof k1 === "string") {
        for(i=k.length-1;i!==-1;--i) {
            k[i] = numeric.ccsLUPSolve(numeric.ccsLUP(numeric.ccsScatter(T)),b[i]);
            k[i][n-1] = k[i][0];
        }
    } else {
        for(i=k.length-1;i!==-1;--i) {
            k[i] = numeric.cLUsolve(numeric.cLU(T),b[i]);
        }
    }
    if(typeof y[0] === "number") k = k[0];
    else k = numeric.transpose(k);
    return new numeric.Spline(x,y,y,k,k);
}

// 8. FFT
numeric.fftpow2 = function fftpow2(x,y) {
    var n = x.length;
    if(n === 1) return;
    var cos = Math.cos, sin = Math.sin, i,j;
    var xe = Array(n/2), ye = Array(n/2), xo = Array(n/2), yo = Array(n/2);
    j = n/2;
    for(i=n-1;i!==-1;--i) {
        --j;
        xo[j] = x[i];
        yo[j] = y[i];
        --i;
        xe[j] = x[i];
        ye[j] = y[i];
    }
    fftpow2(xe,ye);
    fftpow2(xo,yo);
    j = n/2;
    var t,k = (-6.2831853071795864769252867665590057683943387987502116419/n),ci,si;
    for(i=n-1;i!==-1;--i) {
        --j;
        if(j === -1) j = n/2-1;
        t = k*i;
        ci = cos(t);
        si = sin(t);
        x[i] = xe[j] + ci*xo[j] - si*yo[j];
        y[i] = ye[j] + ci*yo[j] + si*xo[j];
    }
}
numeric._ifftpow2 = function _ifftpow2(x,y) {
    var n = x.length;
    if(n === 1) return;
    var cos = Math.cos, sin = Math.sin, i,j;
    var xe = Array(n/2), ye = Array(n/2), xo = Array(n/2), yo = Array(n/2);
    j = n/2;
    for(i=n-1;i!==-1;--i) {
        --j;
        xo[j] = x[i];
        yo[j] = y[i];
        --i;
        xe[j] = x[i];
        ye[j] = y[i];
    }
    _ifftpow2(xe,ye);
    _ifftpow2(xo,yo);
    j = n/2;
    var t,k = (6.2831853071795864769252867665590057683943387987502116419/n),ci,si;
    for(i=n-1;i!==-1;--i) {
        --j;
        if(j === -1) j = n/2-1;
        t = k*i;
        ci = cos(t);
        si = sin(t);
        x[i] = xe[j] + ci*xo[j] - si*yo[j];
        y[i] = ye[j] + ci*yo[j] + si*xo[j];
    }
}
numeric.ifftpow2 = function ifftpow2(x,y) {
    numeric._ifftpow2(x,y);
    numeric.diveq(x,x.length);
    numeric.diveq(y,y.length);
}
numeric.convpow2 = function convpow2(ax,ay,bx,by) {
    numeric.fftpow2(ax,ay);
    numeric.fftpow2(bx,by);
    var i,n = ax.length,axi,bxi,ayi,byi;
    for(i=n-1;i!==-1;--i) {
        axi = ax[i]; ayi = ay[i]; bxi = bx[i]; byi = by[i];
        ax[i] = axi*bxi-ayi*byi;
        ay[i] = axi*byi+ayi*bxi;
    }
    numeric.ifftpow2(ax,ay);
}
numeric.T.prototype.fft = function fft() {
    var x = this.x, y = this.y;
    var n = x.length, log = Math.log, log2 = log(2),
        p = Math.ceil(log(2*n-1)/log2), m = Math.pow(2,p);
    var cx = numeric.rep([m],0), cy = numeric.rep([m],0), cos = Math.cos, sin = Math.sin;
    var k, c = (-3.141592653589793238462643383279502884197169399375105820/n),t;
    var a = numeric.rep([m],0), b = numeric.rep([m],0),nhalf = Math.floor(n/2);
    for(k=0;k<n;k++) a[k] = x[k];
    if(typeof y !== "undefined") for(k=0;k<n;k++) b[k] = y[k];
    cx[0] = 1;
    for(k=1;k<=m/2;k++) {
        t = c*k*k;
        cx[k] = cos(t);
        cy[k] = sin(t);
        cx[m-k] = cos(t);
        cy[m-k] = sin(t)
    }
    var X = new numeric.T(a,b), Y = new numeric.T(cx,cy);
    X = X.mul(Y);
    numeric.convpow2(X.x,X.y,numeric.clone(Y.x),numeric.neg(Y.y));
    X = X.mul(Y);
    X.x.length = n;
    X.y.length = n;
    return X;
}
numeric.T.prototype.ifft = function ifft() {
    var x = this.x, y = this.y;
    var n = x.length, log = Math.log, log2 = log(2),
        p = Math.ceil(log(2*n-1)/log2), m = Math.pow(2,p);
    var cx = numeric.rep([m],0), cy = numeric.rep([m],0), cos = Math.cos, sin = Math.sin;
    var k, c = (3.141592653589793238462643383279502884197169399375105820/n),t;
    var a = numeric.rep([m],0), b = numeric.rep([m],0),nhalf = Math.floor(n/2);
    for(k=0;k<n;k++) a[k] = x[k];
    if(typeof y !== "undefined") for(k=0;k<n;k++) b[k] = y[k];
    cx[0] = 1;
    for(k=1;k<=m/2;k++) {
        t = c*k*k;
        cx[k] = cos(t);
        cy[k] = sin(t);
        cx[m-k] = cos(t);
        cy[m-k] = sin(t)
    }
    var X = new numeric.T(a,b), Y = new numeric.T(cx,cy);
    X = X.mul(Y);
    numeric.convpow2(X.x,X.y,numeric.clone(Y.x),numeric.neg(Y.y));
    X = X.mul(Y);
    X.x.length = n;
    X.y.length = n;
    return X.div(n);
}

//9. Unconstrained optimization
numeric.gradient = function gradient(f,x) {
    var n = x.length;
    var f0 = f(x);
    if(isNaN(f0)) throw new Error('gradient: f(x) is a NaN!');
    var max = Math.max;
    var i,x0 = numeric.clone(x),f1,f2, J = Array(n);
    var div = numeric.div, sub = numeric.sub,errest,roundoff,max = Math.max,eps = 1e-3,abs = Math.abs, min = Math.min;
    var t0,t1,t2,it=0,d1,d2,N;
    for(i=0;i<n;i++) {
        var h = max(1e-6*f0,1e-8);
        while(1) {
            ++it;
            if(it>20) { throw new Error("Numerical gradient fails"); }
            x0[i] = x[i]+h;
            f1 = f(x0);
            x0[i] = x[i]-h;
            f2 = f(x0);
            x0[i] = x[i];
            if(isNaN(f1) || isNaN(f2)) { h/=16; continue; }
            J[i] = (f1-f2)/(2*h);
            t0 = x[i]-h;
            t1 = x[i];
            t2 = x[i]+h;
            d1 = (f1-f0)/h;
            d2 = (f0-f2)/h;
            N = max(abs(J[i]),abs(f0),abs(f1),abs(f2),abs(t0),abs(t1),abs(t2),1e-8);
            errest = min(max(abs(d1-J[i]),abs(d2-J[i]),abs(d1-d2))/N,h/N);
            if(errest>eps) { h/=16; }
            else break;
            }
    }
    return J;
}

numeric.uncmin = function uncmin(f,x0,tol,gradient,maxit,callback,options) {
    var grad = numeric.gradient;
    if(typeof options === "undefined") { options = {}; }
    if(typeof tol === "undefined") { tol = 1e-8; }
    if(typeof gradient === "undefined") { gradient = function(x) { return grad(f,x); }; }
    if(typeof maxit === "undefined") maxit = 1000;
    x0 = numeric.clone(x0);
    var n = x0.length;
    var f0 = f(x0),f1,df0;
    if(isNaN(f0)) throw new Error('uncmin: f(x0) is a NaN!');
    var max = Math.max, norm2 = numeric.norm2;
    tol = max(tol,numeric.epsilon);
    var step,g0,g1,H1 = options.Hinv || numeric.identity(n);
    var dot = numeric.dot, inv = numeric.inv, sub = numeric.sub, add = numeric.add, ten = numeric.tensor, div = numeric.div, mul = numeric.mul;
    var all = numeric.all, isfinite = numeric.isFinite, neg = numeric.neg;
    var it=0,i,s,x1,y,Hy,Hs,ys,i0,t,nstep,t1,t2;
    var msg = "";
    g0 = gradient(x0);
    while(it<maxit) {
        if(typeof callback === "function") { if(callback(it,x0,f0,g0,H1)) { msg = "Callback returned true"; break; } }
        if(!all(isfinite(g0))) { msg = "Gradient has Infinity or NaN"; break; }
        step = neg(dot(H1,g0));
        if(!all(isfinite(step))) { msg = "Search direction has Infinity or NaN"; break; }
        nstep = norm2(step);
        if(nstep < tol) { msg="Newton step smaller than tol"; break; }
        t = 1;
        df0 = dot(g0,step);
        // line search
        x1 = x0;
        while(it < maxit) {
            if(t*nstep < tol) { break; }
            s = mul(step,t);
            x1 = add(x0,s);
            f1 = f(x1);
            if(f1-f0 >= 0.1*t*df0 || isNaN(f1)) {
                t *= 0.5;
                ++it;
                continue;
            }
            break;
        }
        if(t*nstep < tol) { msg = "Line search step size smaller than tol"; break; }
        if(it === maxit) { msg = "maxit reached during line search"; break; }
        g1 = gradient(x1);
        y = sub(g1,g0);
        ys = dot(y,s);
        Hy = dot(H1,y);
        H1 = sub(add(H1,
                mul(
                        (ys+dot(y,Hy))/(ys*ys),
                        ten(s,s)    )),
                div(add(ten(Hy,s),ten(s,Hy)),ys));
        x0 = x1;
        f0 = f1;
        g0 = g1;
        ++it;
    }
    return {solution: x0, f: f0, gradient: g0, invHessian: H1, iterations:it, message: msg};
}

// 10. Ode solver (Dormand-Prince)
numeric.Dopri = function Dopri(x,y,f,ymid,iterations,msg,events) {
    this.x = x;
    this.y = y;
    this.f = f;
    this.ymid = ymid;
    this.iterations = iterations;
    this.events = events;
    this.message = msg;
}
numeric.Dopri.prototype._at = function _at(xi,j) {
    function sqr(x) { return x*x; }
    var sol = this;
    var xs = sol.x;
    var ys = sol.y;
    var k1 = sol.f;
    var ymid = sol.ymid;
    var n = xs.length;
    var x0,x1,xh,y0,y1,yh,xi;
    var floor = Math.floor,h;
    var c = 0.5;
    var add = numeric.add, mul = numeric.mul,sub = numeric.sub, p,q,w;
    x0 = xs[j];
    x1 = xs[j+1];
    y0 = ys[j];
    y1 = ys[j+1];
    h  = x1-x0;
    xh = x0+c*h;
    yh = ymid[j];
    p = sub(k1[j  ],mul(y0,1/(x0-xh)+2/(x0-x1)));
    q = sub(k1[j+1],mul(y1,1/(x1-xh)+2/(x1-x0)));
    w = [sqr(xi - x1) * (xi - xh) / sqr(x0 - x1) / (x0 - xh),
         sqr(xi - x0) * sqr(xi - x1) / sqr(x0 - xh) / sqr(x1 - xh),
         sqr(xi - x0) * (xi - xh) / sqr(x1 - x0) / (x1 - xh),
         (xi - x0) * sqr(xi - x1) * (xi - xh) / sqr(x0-x1) / (x0 - xh),
         (xi - x1) * sqr(xi - x0) * (xi - xh) / sqr(x0-x1) / (x1 - xh)];
    return add(add(add(add(mul(y0,w[0]),
                           mul(yh,w[1])),
                           mul(y1,w[2])),
                           mul( p,w[3])),
                           mul( q,w[4]));
}
numeric.Dopri.prototype.at = function at(x) {
    var i,j,k,floor = Math.floor;
    if(typeof x !== "number") {
        var n = x.length, ret = Array(n);
        for(i=n-1;i!==-1;--i) {
            ret[i] = this.at(x[i]);
        }
        return ret;
    }
    var x0 = this.x;
    i = 0; j = x0.length-1;
    while(j-i>1) {
        k = floor(0.5*(i+j));
        if(x0[k] <= x) i = k;
        else j = k;
    }
    return this._at(x,i);
}

numeric.dopri = function dopri(x0,x1,y0,f,tol,maxit,event) {
    if(typeof tol === "undefined") { tol = 1e-6; }
    if(typeof maxit === "undefined") { maxit = 1000; }
    var xs = [x0], ys = [y0], k1 = [f(x0,y0)], k2,k3,k4,k5,k6,k7, ymid = [];
    var A2 = 1/5;
    var A3 = [3/40,9/40];
    var A4 = [44/45,-56/15,32/9];
    var A5 = [19372/6561,-25360/2187,64448/6561,-212/729];
    var A6 = [9017/3168,-355/33,46732/5247,49/176,-5103/18656];
    var b = [35/384,0,500/1113,125/192,-2187/6784,11/84];
    var bm = [0.5*6025192743/30085553152,
              0,
              0.5*51252292925/65400821598,
              0.5*-2691868925/45128329728,
              0.5*187940372067/1594534317056,
              0.5*-1776094331/19743644256,
              0.5*11237099/235043384];
    var c = [1/5,3/10,4/5,8/9,1,1];
    var e = [-71/57600,0,71/16695,-71/1920,17253/339200,-22/525,1/40];
    var i = 0,er,j;
    var h = (x1-x0)/10;
    var it = 0;
    var add = numeric.add, mul = numeric.mul, y1,erinf;
    var max = Math.max, min = Math.min, abs = Math.abs, norminf = numeric.norminf,pow = Math.pow;
    var any = numeric.any, lt = numeric.lt, and = numeric.and, sub = numeric.sub;
    var e0, e1, ev;
    var ret = new numeric.Dopri(xs,ys,k1,ymid,-1,"");
    if(typeof event === "function") e0 = event(x0,y0);
    while(x0<x1 && it<maxit) {
        ++it;
        if(x0+h>x1) h = x1-x0;
        k2 = f(x0+c[0]*h,                add(y0,mul(   A2*h,k1[i])));
        k3 = f(x0+c[1]*h,            add(add(y0,mul(A3[0]*h,k1[i])),mul(A3[1]*h,k2)));
        k4 = f(x0+c[2]*h,        add(add(add(y0,mul(A4[0]*h,k1[i])),mul(A4[1]*h,k2)),mul(A4[2]*h,k3)));
        k5 = f(x0+c[3]*h,    add(add(add(add(y0,mul(A5[0]*h,k1[i])),mul(A5[1]*h,k2)),mul(A5[2]*h,k3)),mul(A5[3]*h,k4)));
        k6 = f(x0+c[4]*h,add(add(add(add(add(y0,mul(A6[0]*h,k1[i])),mul(A6[1]*h,k2)),mul(A6[2]*h,k3)),mul(A6[3]*h,k4)),mul(A6[4]*h,k5)));
        y1 = add(add(add(add(add(y0,mul(k1[i],h*b[0])),mul(k3,h*b[2])),mul(k4,h*b[3])),mul(k5,h*b[4])),mul(k6,h*b[5]));
        k7 = f(x0+h,y1);
        er = add(add(add(add(add(mul(k1[i],h*e[0]),mul(k3,h*e[2])),mul(k4,h*e[3])),mul(k5,h*e[4])),mul(k6,h*e[5])),mul(k7,h*e[6]));
        if(typeof er === "number") erinf = abs(er);
        else erinf = norminf(er);
        if(erinf > tol) { // reject
            h = 0.2*h*pow(tol/erinf,0.25);
            if(x0+h === x0) {
                ret.msg = "Step size became too small";
                break;
            }
            continue;
        }
        ymid[i] = add(add(add(add(add(add(y0,
                mul(k1[i],h*bm[0])),
                mul(k3   ,h*bm[2])),
                mul(k4   ,h*bm[3])),
                mul(k5   ,h*bm[4])),
                mul(k6   ,h*bm[5])),
                mul(k7   ,h*bm[6]));
        ++i;
        xs[i] = x0+h;
        ys[i] = y1;
        k1[i] = k7;
        if(typeof event === "function") {
            var yi,xl = x0,xr = x0+0.5*h,xi;
            e1 = event(xr,ymid[i-1]);
            ev = and(lt(e0,0),lt(0,e1));
            if(!any(ev)) { xl = xr; xr = x0+h; e0 = e1; e1 = event(xr,y1); ev = and(lt(e0,0),lt(0,e1)); }
            if(any(ev)) {
                var xc, yc, en,ei;
                var side=0, sl = 1.0, sr = 1.0;
                while(1) {
                    if(typeof e0 === "number") xi = (sr*e1*xl-sl*e0*xr)/(sr*e1-sl*e0);
                    else {
                        xi = xr;
                        for(j=e0.length-1;j!==-1;--j) {
                            if(e0[j]<0 && e1[j]>0) xi = min(xi,(sr*e1[j]*xl-sl*e0[j]*xr)/(sr*e1[j]-sl*e0[j]));
                        }
                    }
                    if(xi <= xl || xi >= xr) break;
                    yi = ret._at(xi, i-1);
                    ei = event(xi,yi);
                    en = and(lt(e0,0),lt(0,ei));
                    if(any(en)) {
                        xr = xi;
                        e1 = ei;
                        ev = en;
                        sr = 1.0;
                        if(side === -1) sl *= 0.5;
                        else sl = 1.0;
                        side = -1;
                    } else {
                        xl = xi;
                        e0 = ei;
                        sl = 1.0;
                        if(side === 1) sr *= 0.5;
                        else sr = 1.0;
                        side = 1;
                    }
                }
                y1 = ret._at(0.5*(x0+xi),i-1);
                ret.f[i] = f(xi,yi);
                ret.x[i] = xi;
                ret.y[i] = yi;
                ret.ymid[i-1] = y1;
                ret.events = ev;
                ret.iterations = it;
                return ret;
            }
        }
        x0 += h;
        y0 = y1;
        e0 = e1;
        h = min(0.8*h*pow(tol/erinf,0.25),4*h);
    }
    ret.iterations = it;
    return ret;
}

// 11. Ax = b
numeric.LU = function(A, fast) {
  fast = fast || false;

  var abs = Math.abs;
  var i, j, k, absAjk, Akk, Ak, Pk, Ai;
  var max;
  var n = A.length, n1 = n-1;
  var P = new Array(n);
  if(!fast) A = numeric.clone(A);

  for (k = 0; k < n; ++k) {
    Pk = k;
    Ak = A[k];
    max = abs(Ak[k]);
    for (j = k + 1; j < n; ++j) {
      absAjk = abs(A[j][k]);
      if (max < absAjk) {
        max = absAjk;
        Pk = j;
      }
    }
    P[k] = Pk;

    if (Pk != k) {
      A[k] = A[Pk];
      A[Pk] = Ak;
      Ak = A[k];
    }

    Akk = Ak[k];

    for (i = k + 1; i < n; ++i) {
      A[i][k] /= Akk;
    }

    for (i = k + 1; i < n; ++i) {
      Ai = A[i];
      for (j = k + 1; j < n1; ++j) {
        Ai[j] -= Ai[k] * Ak[j];
        ++j;
        Ai[j] -= Ai[k] * Ak[j];
      }
      if(j===n1) Ai[j] -= Ai[k] * Ak[j];
    }
  }

  return {
    LU: A,
    P:  P
  };
}

numeric.LUsolve = function LUsolve(LUP, b) {
  var i, j;
  var LU = LUP.LU;
  var n   = LU.length;
  var x = numeric.clone(b);
  var P   = LUP.P;
  var Pi, LUi, LUii, tmp;

  for (i=n-1;i!==-1;--i) x[i] = b[i];
  for (i = 0; i < n; ++i) {
    Pi = P[i];
    if (P[i] !== i) {
      tmp = x[i];
      x[i] = x[Pi];
      x[Pi] = tmp;
    }

    LUi = LU[i];
    for (j = 0; j < i; ++j) {
      x[i] -= x[j] * LUi[j];
    }
  }

  for (i = n - 1; i >= 0; --i) {
    LUi = LU[i];
    for (j = i + 1; j < n; ++j) {
      x[i] -= x[j] * LUi[j];
    }

    x[i] /= LUi[i];
  }

  return x;
}

numeric.solve = function solve(A,b,fast) { return numeric.LUsolve(numeric.LU(A,fast), b); }

// 12. Linear programming
numeric.echelonize = function echelonize(A) {
    var s = numeric.dim(A), m = s[0], n = s[1];
    var I = numeric.identity(m);
    var P = Array(m);
    var i,j,k,l,Ai,Ii,Z,a;
    var abs = Math.abs;
    var diveq = numeric.diveq;
    A = numeric.clone(A);
    for(i=0;i<m;++i) {
        k = 0;
        Ai = A[i];
        Ii = I[i];
        for(j=1;j<n;++j) if(abs(Ai[k])<abs(Ai[j])) k=j;
        P[i] = k;
        diveq(Ii,Ai[k]);
        diveq(Ai,Ai[k]);
        for(j=0;j<m;++j) if(j!==i) {
            Z = A[j]; a = Z[k];
            for(l=n-1;l!==-1;--l) Z[l] -= Ai[l]*a;
            Z = I[j];
            for(l=m-1;l!==-1;--l) Z[l] -= Ii[l]*a;
        }
    }
    return {I:I, A:A, P:P};
}

numeric.__solveLP = function __solveLP(c,A,b,tol,maxit,x,flag) {
    var sum = numeric.sum, log = numeric.log, mul = numeric.mul, sub = numeric.sub, dot = numeric.dot, div = numeric.div, add = numeric.add;
    var m = c.length, n = b.length,y;
    var unbounded = false, cb,i0=0;
    var alpha = 1.0;
    var f0,df0,AT = numeric.transpose(A), svd = numeric.svd,transpose = numeric.transpose,leq = numeric.leq, sqrt = Math.sqrt, abs = Math.abs;
    var muleq = numeric.muleq;
    var norm = numeric.norminf, any = numeric.any,min = Math.min;
    var all = numeric.all, gt = numeric.gt;
    var p = Array(m), A0 = Array(n),e=numeric.rep([n],1), H;
    var solve = numeric.solve, z = sub(b,dot(A,x)),count;
    var dotcc = dot(c,c);
    var g;
    for(count=i0;count<maxit;++count) {
        var i,j,d;
        for(i=n-1;i!==-1;--i) A0[i] = div(A[i],z[i]);
        var A1 = transpose(A0);
        for(i=m-1;i!==-1;--i) p[i] = (/*x[i]+*/sum(A1[i]));
        alpha = 0.25*abs(dotcc/dot(c,p));
        var a1 = 100*sqrt(dotcc/dot(p,p));
        if(!isFinite(alpha) || alpha>a1) alpha = a1;
        g = add(c,mul(alpha,p));
        H = dot(A1,A0);
        for(i=m-1;i!==-1;--i) H[i][i] += 1;
        d = solve(H,div(g,alpha),true);
        var t0 = div(z,dot(A,d));
        var t = 1.0;
        for(i=n-1;i!==-1;--i) if(t0[i]<0) t = min(t,-0.999*t0[i]);
        y = sub(x,mul(d,t));
        z = sub(b,dot(A,y));
        if(!all(gt(z,0))) return { solution: x, message: "", iterations: count };
        x = y;
        if(alpha<tol) return { solution: y, message: "", iterations: count };
        if(flag) {
            var s = dot(c,g), Ag = dot(A,g);
            unbounded = true;
            for(i=n-1;i!==-1;--i) if(s*Ag[i]<0) { unbounded = false; break; }
        } else {
            if(x[m-1]>=0) unbounded = false;
            else unbounded = true;
        }
        if(unbounded) return { solution: y, message: "Unbounded", iterations: count };
    }
    return { solution: x, message: "maximum iteration count exceeded", iterations:count };
}

numeric._solveLP = function _solveLP(c,A,b,tol,maxit) {
    var m = c.length, n = b.length,y;
    var sum = numeric.sum, log = numeric.log, mul = numeric.mul, sub = numeric.sub, dot = numeric.dot, div = numeric.div, add = numeric.add;
    var c0 = numeric.rep([m],0).concat([1]);
    var J = numeric.rep([n,1],-1);
    var A0 = numeric.blockMatrix([[A                   ,   J  ]]);
    var b0 = b;
    var y = numeric.rep([m],0).concat(Math.max(0,numeric.sup(numeric.neg(b)))+1);
    var x0 = numeric.__solveLP(c0,A0,b0,tol,maxit,y,false);
    var x = numeric.clone(x0.solution);
    x.length = m;
    var foo = numeric.inf(sub(b,dot(A,x)));
    if(foo<0) { return { solution: NaN, message: "Infeasible", iterations: x0.iterations }; }
    var ret = numeric.__solveLP(c, A, b, tol, maxit-x0.iterations, x, true);
    ret.iterations += x0.iterations;
    return ret;
};

numeric.solveLP = function solveLP(c,A,b,Aeq,beq,tol,maxit) {
    if(typeof maxit === "undefined") maxit = 1000;
    if(typeof tol === "undefined") tol = numeric.epsilon;
    if(typeof Aeq === "undefined") return numeric._solveLP(c,A,b,tol,maxit);
    var m = Aeq.length, n = Aeq[0].length, o = A.length;
    var B = numeric.echelonize(Aeq);
    var flags = numeric.rep([n],0);
    var P = B.P;
    var Q = [];
    var i;
    for(i=P.length-1;i!==-1;--i) flags[P[i]] = 1;
    for(i=n-1;i!==-1;--i) if(flags[i]===0) Q.push(i);
    var g = numeric.getRange;
    var I = numeric.linspace(0,m-1), J = numeric.linspace(0,o-1);
    var Aeq2 = g(Aeq,I,Q), A1 = g(A,J,P), A2 = g(A,J,Q), dot = numeric.dot, sub = numeric.sub;
    var A3 = dot(A1,B.I);
    var A4 = sub(A2,dot(A3,Aeq2)), b4 = sub(b,dot(A3,beq));
    var c1 = Array(P.length), c2 = Array(Q.length);
    for(i=P.length-1;i!==-1;--i) c1[i] = c[P[i]];
    for(i=Q.length-1;i!==-1;--i) c2[i] = c[Q[i]];
    var c4 = sub(c2,dot(c1,dot(B.I,Aeq2)));
    var S = numeric._solveLP(c4,A4,b4,tol,maxit);
    var x2 = S.solution;
    if(x2!==x2) return S;
    var x1 = dot(B.I,sub(beq,dot(Aeq2,x2)));
    var x = Array(c.length);
    for(i=P.length-1;i!==-1;--i) x[P[i]] = x1[i];
    for(i=Q.length-1;i!==-1;--i) x[Q[i]] = x2[i];
    return { solution: x, message:S.message, iterations: S.iterations };
}

numeric.MPStoLP = function MPStoLP(MPS) {
    if(MPS instanceof String) { MPS.split('\n'); }
    var state = 0;
    var states = ['Initial state','NAME','ROWS','COLUMNS','RHS','BOUNDS','ENDATA'];
    var n = MPS.length;
    var i,j,z,N=0,rows = {}, sign = [], rl = 0, vars = {}, nv = 0;
    var name;
    var c = [], A = [], b = [];
    function err(e) { throw new Error('MPStoLP: '+e+'\nLine '+i+': '+MPS[i]+'\nCurrent state: '+states[state]+'\n'); }
    for(i=0;i<n;++i) {
        z = MPS[i];
        var w0 = z.match(/\S*/g);
        var w = [];
        for(j=0;j<w0.length;++j) if(w0[j]!=="") w.push(w0[j]);
        if(w.length === 0) continue;
        for(j=0;j<states.length;++j) if(z.substr(0,states[j].length) === states[j]) break;
        if(j<states.length) {
            state = j;
            if(j===1) { name = w[1]; }
            if(j===6) return { name:name, c:c, A:numeric.transpose(A), b:b, rows:rows, vars:vars };
            continue;
        }
        switch(state) {
        case 0: case 1: err('Unexpected line');
        case 2: 
            switch(w[0]) {
            case 'N': if(N===0) N = w[1]; else err('Two or more N rows'); break;
            case 'L': rows[w[1]] = rl; sign[rl] = 1; b[rl] = 0; ++rl; break;
            case 'G': rows[w[1]] = rl; sign[rl] = -1;b[rl] = 0; ++rl; break;
            case 'E': rows[w[1]] = rl; sign[rl] = 0;b[rl] = 0; ++rl; break;
            default: err('Parse error '+numeric.prettyPrint(w));
            }
            break;
        case 3:
            if(!vars.hasOwnProperty(w[0])) { vars[w[0]] = nv; c[nv] = 0; A[nv] = numeric.rep([rl],0); ++nv; }
            var p = vars[w[0]];
            for(j=1;j<w.length;j+=2) {
                if(w[j] === N) { c[p] = parseFloat(w[j+1]); continue; }
                var q = rows[w[j]];
                A[p][q] = (sign[q]<0?-1:1)*parseFloat(w[j+1]);
            }
            break;
        case 4:
            for(j=1;j<w.length;j+=2) b[rows[w[j]]] = (sign[rows[w[j]]]<0?-1:1)*parseFloat(w[j+1]);
            break;
        case 5: /*FIXME*/ break;
        case 6: err('Internal error');
        }
    }
    err('Reached end of file without ENDATA');
}
// seedrandom.js version 2.0.
// Author: David Bau 4/2/2011
//
// Defines a method Math.seedrandom() that, when called, substitutes
// an explicitly seeded RC4-based algorithm for Math.random().  Also
// supports automatic seeding from local or network sources of entropy.
//
// Usage:
//
//   <script src=http://davidbau.com/encode/seedrandom-min.js></script>
//
//   Math.seedrandom('yipee'); Sets Math.random to a function that is
//                             initialized using the given explicit seed.
//
//   Math.seedrandom();        Sets Math.random to a function that is
//                             seeded using the current time, dom state,
//                             and other accumulated local entropy.
//                             The generated seed string is returned.
//
//   Math.seedrandom('yowza', true);
//                             Seeds using the given explicit seed mixed
//                             together with accumulated entropy.
//
//   <script src="http://bit.ly/srandom-512"></script>
//                             Seeds using physical random bits downloaded
//                             from random.org.
//
//   <script src="https://jsonlib.appspot.com/urandom?callback=Math.seedrandom">
//   </script>                 Seeds using urandom bits from call.jsonlib.com,
//                             which is faster than random.org.
//
// Examples:
//
//   Math.seedrandom("hello");            // Use "hello" as the seed.
//   document.write(Math.random());       // Always 0.5463663768140734
//   document.write(Math.random());       // Always 0.43973793770592234
//   var rng1 = Math.random;              // Remember the current prng.
//
//   var autoseed = Math.seedrandom();    // New prng with an automatic seed.
//   document.write(Math.random());       // Pretty much unpredictable.
//
//   Math.random = rng1;                  // Continue "hello" prng sequence.
//   document.write(Math.random());       // Always 0.554769432473455
//
//   Math.seedrandom(autoseed);           // Restart at the previous seed.
//   document.write(Math.random());       // Repeat the 'unpredictable' value.
//
// Notes:
//
// Each time seedrandom('arg') is called, entropy from the passed seed
// is accumulated in a pool to help generate future seeds for the
// zero-argument form of Math.seedrandom, so entropy can be injected over
// time by calling seedrandom with explicit data repeatedly.
//
// On speed - This javascript implementation of Math.random() is about
// 3-10x slower than the built-in Math.random() because it is not native
// code, but this is typically fast enough anyway.  Seeding is more expensive,
// especially if you use auto-seeding.  Some details (timings on Chrome 4):
//
// Our Math.random()            - avg less than 0.002 milliseconds per call
// seedrandom('explicit')       - avg less than 0.5 milliseconds per call
// seedrandom('explicit', true) - avg less than 2 milliseconds per call
// seedrandom()                 - avg about 38 milliseconds per call
//
// LICENSE (BSD):
//
// Copyright 2010 David Bau, all rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
// 
//   1. Redistributions of source code must retain the above copyright
//      notice, this list of conditions and the following disclaimer.
//
//   2. Redistributions in binary form must reproduce the above copyright
//      notice, this list of conditions and the following disclaimer in the
//      documentation and/or other materials provided with the distribution.
// 
//   3. Neither the name of this module nor the names of its contributors may
//      be used to endorse or promote products derived from this software
//      without specific prior written permission.
// 
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
/**
 * All code is in an anonymous closure to keep the global namespace clean.
 *
 * @param {number=} overflow 
 * @param {number=} startdenom
 */

// Patched by Seb so that seedrandom.js does not pollute the Math object.
// My tests suggest that doing Math.trouble = 1 makes Math lookups about 5%
// slower.
numeric.seedrandom = { pow:Math.pow, random:Math.random };

(function (pool, math, width, chunks, significance, overflow, startdenom) {


//
// seedrandom()
// This is the seedrandom function described above.
//
math['seedrandom'] = function seedrandom(seed, use_entropy) {
  var key = [];
  var arc4;

  // Flatten the seed string or build one from local entropy if needed.
  seed = mixkey(flatten(
    use_entropy ? [seed, pool] :
    arguments.length ? seed :
    [new Date().getTime(), pool, window], 3), key);

  // Use the seed to initialize an ARC4 generator.
  arc4 = new ARC4(key);

  // Mix the randomness into accumulated entropy.
  mixkey(arc4.S, pool);

  // Override Math.random

  // This function returns a random double in [0, 1) that contains
  // randomness in every bit of the mantissa of the IEEE 754 value.

  math['random'] = function random() {  // Closure to return a random double:
    var n = arc4.g(chunks);             // Start with a numerator n < 2 ^ 48
    var d = startdenom;                 //   and denominator d = 2 ^ 48.
    var x = 0;                          //   and no 'extra last byte'.
    while (n < significance) {          // Fill up all significant digits by
      n = (n + x) * width;              //   shifting numerator and
      d *= width;                       //   denominator and generating a
      x = arc4.g(1);                    //   new least-significant-byte.
    }
    while (n >= overflow) {             // To avoid rounding up, before adding
      n /= 2;                           //   last byte, shift everything
      d /= 2;                           //   right using integer math until
      x >>>= 1;                         //   we have exactly the desired bits.
    }
    return (n + x) / d;                 // Form the number within [0, 1).
  };

  // Return the seed that was used
  return seed;
};

//
// ARC4
//
// An ARC4 implementation.  The constructor takes a key in the form of
// an array of at most (width) integers that should be 0 <= x < (width).
//
// The g(count) method returns a pseudorandom integer that concatenates
// the next (count) outputs from ARC4.  Its return value is a number x
// that is in the range 0 <= x < (width ^ count).
//
/** @constructor */
function ARC4(key) {
  var t, u, me = this, keylen = key.length;
  var i = 0, j = me.i = me.j = me.m = 0;
  me.S = [];
  me.c = [];

  // The empty key [] is treated as [0].
  if (!keylen) { key = [keylen++]; }

  // Set up S using the standard key scheduling algorithm.
  while (i < width) { me.S[i] = i++; }
  for (i = 0; i < width; i++) {
    t = me.S[i];
    j = lowbits(j + t + key[i % keylen]);
    u = me.S[j];
    me.S[i] = u;
    me.S[j] = t;
  }

  // The "g" method returns the next (count) outputs as one number.
  me.g = function getnext(count) {
    var s = me.S;
    var i = lowbits(me.i + 1); var t = s[i];
    var j = lowbits(me.j + t); var u = s[j];
    s[i] = u;
    s[j] = t;
    var r = s[lowbits(t + u)];
    while (--count) {
      i = lowbits(i + 1); t = s[i];
      j = lowbits(j + t); u = s[j];
      s[i] = u;
      s[j] = t;
      r = r * width + s[lowbits(t + u)];
    }
    me.i = i;
    me.j = j;
    return r;
  };
  // For robust unpredictability discard an initial batch of values.
  // See http://www.rsa.com/rsalabs/node.asp?id=2009
  me.g(width);
}

//
// flatten()
// Converts an object tree to nested arrays of strings.
//
/** @param {Object=} result 
  * @param {string=} prop
  * @param {string=} typ */
function flatten(obj, depth, result, prop, typ) {
  result = [];
  typ = typeof(obj);
  if (depth && typ == 'object') {
    for (prop in obj) {
      if (prop.indexOf('S') < 5) {    // Avoid FF3 bug (local/sessionStorage)
        try { result.push(flatten(obj[prop], depth - 1)); } catch (e) {}
      }
    }
  }
  return (result.length ? result : obj + (typ != 'string' ? '\0' : ''));
}

//
// mixkey()
// Mixes a string seed into a key that is an array of integers, and
// returns a shortened string seed that is equivalent to the result key.
//
/** @param {number=} smear 
  * @param {number=} j */
function mixkey(seed, key, smear, j) {
  seed += '';                         // Ensure the seed is a string
  smear = 0;
  for (j = 0; j < seed.length; j++) {
    key[lowbits(j)] =
      lowbits((smear ^= key[lowbits(j)] * 19) + seed.charCodeAt(j));
  }
  seed = '';
  for (j in key) { seed += String.fromCharCode(key[j]); }
  return seed;
}

//
// lowbits()
// A quick "n mod width" for width a power of 2.
//
function lowbits(n) { return n & (width - 1); }

//
// The following constants are related to IEEE 754 limits.
//
startdenom = math.pow(width, chunks);
significance = math.pow(2, significance);
overflow = significance * 2;

//
// When seedrandom.js is loaded, we immediately mix a few bits
// from the built-in RNG into the entropy pool.  Because we do
// not want to intefere with determinstic PRNG state later,
// seedrandom will not call math.random on its own again after
// initialization.
//
mixkey(math.random(), pool);

// End anonymous scope, and pass initial values.
}(
  [],   // pool: entropy pool starts empty
  numeric.seedrandom, // math: package containing random, pow, and seedrandom
  256,  // width: each RC4 output is 0 <= x < 256
  6,    // chunks: at least six RC4 outputs for each double
  52    // significance: there are 52 significant digits in a double
  ));
/* This file is a slightly modified version of quadprog.js from Alberto Santini.
 * It has been slightly modified by Sébastien Loisel to make sure that it handles
 * 0-based Arrays instead of 1-based Arrays.
 * License is in resources/LICENSE.quadprog */
(function(exports) {

function base0to1(A) {
    if(typeof A !== "object") { return A; }
    var ret = [], i,n=A.length;
    for(i=0;i<n;i++) ret[i+1] = base0to1(A[i]);
    return ret;
}
function base1to0(A) {
    if(typeof A !== "object") { return A; }
    var ret = [], i,n=A.length;
    for(i=1;i<n;i++) ret[i-1] = base1to0(A[i]);
    return ret;
}

function dpori(a, lda, n) {
    var i, j, k, kp1, t;

    for (k = 1; k <= n; k = k + 1) {
        a[k][k] = 1 / a[k][k];
        t = -a[k][k];
        //~ dscal(k - 1, t, a[1][k], 1);
        for (i = 1; i < k; i = i + 1) {
            a[i][k] = t * a[i][k];
        }

        kp1 = k + 1;
        if (n < kp1) {
            break;
        }
        for (j = kp1; j <= n; j = j + 1) {
            t = a[k][j];
            a[k][j] = 0;
            //~ daxpy(k, t, a[1][k], 1, a[1][j], 1);
            for (i = 1; i <= k; i = i + 1) {
                a[i][j] = a[i][j] + (t * a[i][k]);
            }
        }
    }

}

function dposl(a, lda, n, b) {
    var i, k, kb, t;

    for (k = 1; k <= n; k = k + 1) {
        //~ t = ddot(k - 1, a[1][k], 1, b[1], 1);
        t = 0;
        for (i = 1; i < k; i = i + 1) {
            t = t + (a[i][k] * b[i]);
        }

        b[k] = (b[k] - t) / a[k][k];
    }

    for (kb = 1; kb <= n; kb = kb + 1) {
        k = n + 1 - kb;
        b[k] = b[k] / a[k][k];
        t = -b[k];
        //~ daxpy(k - 1, t, a[1][k], 1, b[1], 1);
        for (i = 1; i < k; i = i + 1) {
            b[i] = b[i] + (t * a[i][k]);
        }
    }
}

function dpofa(a, lda, n, info) {
    var i, j, jm1, k, t, s;

    for (j = 1; j <= n; j = j + 1) {
        info[1] = j;
        s = 0;
        jm1 = j - 1;
        if (jm1 < 1) {
            s = a[j][j] - s;
            if (s <= 0) {
                break;
            }
            a[j][j] = Math.sqrt(s);
        } else {
            for (k = 1; k <= jm1; k = k + 1) {
                //~ t = a[k][j] - ddot(k - 1, a[1][k], 1, a[1][j], 1);
                t = a[k][j];
                for (i = 1; i < k; i = i + 1) {
                    t = t - (a[i][j] * a[i][k]);
                }
                t = t / a[k][k];
                a[k][j] = t;
                s = s + t * t;
            }
            s = a[j][j] - s;
            if (s <= 0) {
                break;
            }
            a[j][j] = Math.sqrt(s);
        }
        info[1] = 0;
    }
}

function qpgen2(dmat, dvec, fddmat, n, sol, crval, amat,
    bvec, fdamat, q, meq, iact, nact, iter, work, ierr) {

    var i, j, l, l1, info, it1, iwzv, iwrv, iwrm, iwsv, iwuv, nvl, r, iwnbv,
        temp, sum, t1, tt, gc, gs, nu,
        t1inf, t2min,
        vsmall, tmpa, tmpb,
        go;

    r = Math.min(n, q);
    l = 2 * n + (r * (r + 5)) / 2 + 2 * q + 1;

    vsmall = 1.0e-60;
    do {
        vsmall = vsmall + vsmall;
        tmpa = 1 + 0.1 * vsmall;
        tmpb = 1 + 0.2 * vsmall;
    } while (tmpa <= 1 || tmpb <= 1);

    for (i = 1; i <= n; i = i + 1) {
        work[i] = dvec[i];
    }
    for (i = n + 1; i <= l; i = i + 1) {
        work[i] = 0;
    }
    for (i = 1; i <= q; i = i + 1) {
        iact[i] = 0;
    }

    info = [];

    if (ierr[1] === 0) {
        dpofa(dmat, fddmat, n, info);
        if (info[1] !== 0) {
            ierr[1] = 2;
            return;
        }
        dposl(dmat, fddmat, n, dvec);
        dpori(dmat, fddmat, n);
    } else {
        for (j = 1; j <= n; j = j + 1) {
            sol[j] = 0;
            for (i = 1; i <= j; i = i + 1) {
                sol[j] = sol[j] + dmat[i][j] * dvec[i];
            }
        }
        for (j = 1; j <= n; j = j + 1) {
            dvec[j] = 0;
            for (i = j; i <= n; i = i + 1) {
                dvec[j] = dvec[j] + dmat[j][i] * sol[i];
            }
        }
    }

    crval[1] = 0;
    for (j = 1; j <= n; j = j + 1) {
        sol[j] = dvec[j];
        crval[1] = crval[1] + work[j] * sol[j];
        work[j] = 0;
        for (i = j + 1; i <= n; i = i + 1) {
            dmat[i][j] = 0;
        }
    }
    crval[1] = -crval[1] / 2;
    ierr[1] = 0;

    iwzv = n;
    iwrv = iwzv + n;
    iwuv = iwrv + r;
    iwrm = iwuv + r + 1;
    iwsv = iwrm + (r * (r + 1)) / 2;
    iwnbv = iwsv + q;

    for (i = 1; i <= q; i = i + 1) {
        sum = 0;
        for (j = 1; j <= n; j = j + 1) {
            sum = sum + amat[j][i] * amat[j][i];
        }
        work[iwnbv + i] = Math.sqrt(sum);
    }
    nact = 0;
    iter[1] = 0;
    iter[2] = 0;

    function fn_goto_50() {
        iter[1] = iter[1] + 1;

        l = iwsv;
        for (i = 1; i <= q; i = i + 1) {
            l = l + 1;
            sum = -bvec[i];
            for (j = 1; j <= n; j = j + 1) {
                sum = sum + amat[j][i] * sol[j];
            }
            if (Math.abs(sum) < vsmall) {
                sum = 0;
            }
            if (i > meq) {
                work[l] = sum;
            } else {
                work[l] = -Math.abs(sum);
                if (sum > 0) {
                    for (j = 1; j <= n; j = j + 1) {
                        amat[j][i] = -amat[j][i];
                    }
                    bvec[i] = -bvec[i];
                }
            }
        }

        for (i = 1; i <= nact; i = i + 1) {
            work[iwsv + iact[i]] = 0;
        }

        nvl = 0;
        temp = 0;
        for (i = 1; i <= q; i = i + 1) {
            if (work[iwsv + i] < temp * work[iwnbv + i]) {
                nvl = i;
                temp = work[iwsv + i] / work[iwnbv + i];
            }
        }
        if (nvl === 0) {
            return 999;
        }

        return 0;
    }

    function fn_goto_55() {
        for (i = 1; i <= n; i = i + 1) {
            sum = 0;
            for (j = 1; j <= n; j = j + 1) {
                sum = sum + dmat[j][i] * amat[j][nvl];
            }
            work[i] = sum;
        }

        l1 = iwzv;
        for (i = 1; i <= n; i = i + 1) {
            work[l1 + i] = 0;
        }
        for (j = nact + 1; j <= n; j = j + 1) {
            for (i = 1; i <= n; i = i + 1) {
                work[l1 + i] = work[l1 + i] + dmat[i][j] * work[j];
            }
        }

        t1inf = true;
        for (i = nact; i >= 1; i = i - 1) {
            sum = work[i];
            l = iwrm + (i * (i + 3)) / 2;
            l1 = l - i;
            for (j = i + 1; j <= nact; j = j + 1) {
                sum = sum - work[l] * work[iwrv + j];
                l = l + j;
            }
            sum = sum / work[l1];
            work[iwrv + i] = sum;
            if (iact[i] < meq) {
                // continue;
                break;
            }
            if (sum < 0) {
                // continue;
                break;
            }
            t1inf = false;
            it1 = i;
        }

        if (!t1inf) {
            t1 = work[iwuv + it1] / work[iwrv + it1];
            for (i = 1; i <= nact; i = i + 1) {
                if (iact[i] < meq) {
                    // continue;
                    break;
                }
                if (work[iwrv + i] < 0) {
                    // continue;
                    break;
                }
                temp = work[iwuv + i] / work[iwrv + i];
                if (temp < t1) {
                    t1 = temp;
                    it1 = i;
                }
            }
        }

        sum = 0;
        for (i = iwzv + 1; i <= iwzv + n; i = i + 1) {
            sum = sum + work[i] * work[i];
        }
        if (Math.abs(sum) <= vsmall) {
            if (t1inf) {
                ierr[1] = 1;
                // GOTO 999
                return 999;
            } else {
                for (i = 1; i <= nact; i = i + 1) {
                    work[iwuv + i] = work[iwuv + i] - t1 * work[iwrv + i];
                }
                work[iwuv + nact + 1] = work[iwuv + nact + 1] + t1;
                // GOTO 700
                return 700;
            }
        } else {
            sum = 0;
            for (i = 1; i <= n; i = i + 1) {
                sum = sum + work[iwzv + i] * amat[i][nvl];
            }
            tt = -work[iwsv + nvl] / sum;
            t2min = true;
            if (!t1inf) {
                if (t1 < tt) {
                    tt = t1;
                    t2min = false;
                }
            }

            for (i = 1; i <= n; i = i + 1) {
                sol[i] = sol[i] + tt * work[iwzv + i];
                if (Math.abs(sol[i]) < vsmall) {
                    sol[i] = 0;
                }
            }

            crval[1] = crval[1] + tt * sum * (tt / 2 + work[iwuv + nact + 1]);
            for (i = 1; i <= nact; i = i + 1) {
                work[iwuv + i] = work[iwuv + i] - tt * work[iwrv + i];
            }
            work[iwuv + nact + 1] = work[iwuv + nact + 1] + tt;

            if (t2min) {
                nact = nact + 1;
                iact[nact] = nvl;

                l = iwrm + ((nact - 1) * nact) / 2 + 1;
                for (i = 1; i <= nact - 1; i = i + 1) {
                    work[l] = work[i];
                    l = l + 1;
                }

                if (nact === n) {
                    work[l] = work[n];
                } else {
                    for (i = n; i >= nact + 1; i = i - 1) {
                        if (work[i] === 0) {
                            // continue;
                            break;
                        }
                        gc = Math.max(Math.abs(work[i - 1]), Math.abs(work[i]));
                        gs = Math.min(Math.abs(work[i - 1]), Math.abs(work[i]));
                        if (work[i - 1] >= 0) {
                            temp = Math.abs(gc * Math.sqrt(1 + gs * gs / (gc * gc)));
                        } else {
                            temp = -Math.abs(gc * Math.sqrt(1 + gs * gs / (gc * gc)));
                        }
                        gc = work[i - 1] / temp;
                        gs = work[i] / temp;

                        if (gc === 1) {
                            // continue;
                            break;
                        }
                        if (gc === 0) {
                            work[i - 1] = gs * temp;
                            for (j = 1; j <= n; j = j + 1) {
                                temp = dmat[j][i - 1];
                                dmat[j][i - 1] = dmat[j][i];
                                dmat[j][i] = temp;
                            }
                        } else {
                            work[i - 1] = temp;
                            nu = gs / (1 + gc);
                            for (j = 1; j <= n; j = j + 1) {
                                temp = gc * dmat[j][i - 1] + gs * dmat[j][i];
                                dmat[j][i] = nu * (dmat[j][i - 1] + temp) - dmat[j][i];
                                dmat[j][i - 1] = temp;

                            }
                        }
                    }
                    work[l] = work[nact];
                }
            } else {
                sum = -bvec[nvl];
                for (j = 1; j <= n; j = j + 1) {
                    sum = sum + sol[j] * amat[j][nvl];
                }
                if (nvl > meq) {
                    work[iwsv + nvl] = sum;
                } else {
                    work[iwsv + nvl] = -Math.abs(sum);
                    if (sum > 0) {
                        for (j = 1; j <= n; j = j + 1) {
                            amat[j][nvl] = -amat[j][nvl];
                        }
                        bvec[nvl] = -bvec[nvl];
                    }
                }
                // GOTO 700
                return 700;
            }
        }

        return 0;
    }

    function fn_goto_797() {
        l = iwrm + (it1 * (it1 + 1)) / 2 + 1;
        l1 = l + it1;
        if (work[l1] === 0) {
            // GOTO 798
            return 798;
        }
        gc = Math.max(Math.abs(work[l1 - 1]), Math.abs(work[l1]));
        gs = Math.min(Math.abs(work[l1 - 1]), Math.abs(work[l1]));
        if (work[l1 - 1] >= 0) {
            temp = Math.abs(gc * Math.sqrt(1 + gs * gs / (gc * gc)));
        } else {
            temp = -Math.abs(gc * Math.sqrt(1 + gs * gs / (gc * gc)));
        }
        gc = work[l1 - 1] / temp;
        gs = work[l1] / temp;

        if (gc === 1) {
            // GOTO 798
            return 798;
        }
        if (gc === 0) {
            for (i = it1 + 1; i <= nact; i = i + 1) {
                temp = work[l1 - 1];
                work[l1 - 1] = work[l1];
                work[l1] = temp;
                l1 = l1 + i;
            }
            for (i = 1; i <= n; i = i + 1) {
                temp = dmat[i][it1];
                dmat[i][it1] = dmat[i][it1 + 1];
                dmat[i][it1 + 1] = temp;
            }
        } else {
            nu = gs / (1 + gc);
            for (i = it1 + 1; i <= nact; i = i + 1) {
                temp = gc * work[l1 - 1] + gs * work[l1];
                work[l1] = nu * (work[l1 - 1] + temp) - work[l1];
                work[l1 - 1] = temp;
                l1 = l1 + i;
            }
            for (i = 1; i <= n; i = i + 1) {
                temp = gc * dmat[i][it1] + gs * dmat[i][it1 + 1];
                dmat[i][it1 + 1] = nu * (dmat[i][it1] + temp) - dmat[i][it1 + 1];
                dmat[i][it1] = temp;
            }
        }

        return 0;
    }

    function fn_goto_798() {
        l1 = l - it1;
        for (i = 1; i <= it1; i = i + 1) {
            work[l1] = work[l];
            l = l + 1;
            l1 = l1 + 1;
        }

        work[iwuv + it1] = work[iwuv + it1 + 1];
        iact[it1] = iact[it1 + 1];
        it1 = it1 + 1;
        if (it1 < nact) {
            // GOTO 797
            return 797;
        }

        return 0;
    }

    function fn_goto_799() {
        work[iwuv + nact] = work[iwuv + nact + 1];
        work[iwuv + nact + 1] = 0;
        iact[nact] = 0;
        nact = nact - 1;
        iter[2] = iter[2] + 1;

        return 0;
    }

    go = 0;
    while (true) {
        go = fn_goto_50();
        if (go === 999) {
            return;
        }
        while (true) {
            go = fn_goto_55();
            if (go === 0) {
                break;
            }
            if (go === 999) {
                return;
            }
            if (go === 700) {
                if (it1 === nact) {
                    fn_goto_799();
                } else {
                    while (true) {
                        fn_goto_797();
                        go = fn_goto_798();
                        if (go !== 797) {
                            break;
                        }
                    }
                    fn_goto_799();
                }
            }
        }
    }

}

function solveQP(Dmat, dvec, Amat, bvec, meq, factorized) {
    Dmat = base0to1(Dmat);
    dvec = base0to1(dvec);
    Amat = base0to1(Amat);
    var i, n, q,
        nact, r,
        crval = [], iact = [], sol = [], work = [], iter = [],
        message;

    meq = meq || 0;
    factorized = factorized ? base0to1(factorized) : [undefined, 0];
    bvec = bvec ? base0to1(bvec) : [];

    // In Fortran the array index starts from 1
    n = Dmat.length - 1;
    q = Amat[1].length - 1;

    if (!bvec) {
        for (i = 1; i <= q; i = i + 1) {
            bvec[i] = 0;
        }
    }
    for (i = 1; i <= q; i = i + 1) {
        iact[i] = 0;
    }
    nact = 0;
    r = Math.min(n, q);
    for (i = 1; i <= n; i = i + 1) {
        sol[i] = 0;
    }
    crval[1] = 0;
    for (i = 1; i <= (2 * n + (r * (r + 5)) / 2 + 2 * q + 1); i = i + 1) {
        work[i] = 0;
    }
    for (i = 1; i <= 2; i = i + 1) {
        iter[i] = 0;
    }

    qpgen2(Dmat, dvec, n, n, sol, crval, Amat,
        bvec, n, q, meq, iact, nact, iter, work, factorized);

    message = "";
    if (factorized[1] === 1) {
        message = "constraints are inconsistent, no solution!";
    }
    if (factorized[1] === 2) {
        message = "matrix D in quadratic function is not positive definite!";
    }

    return {
        solution: base1to0(sol),
        value: base1to0(crval),
        unconstrained_solution: base1to0(dvec),
        iterations: base1to0(iter),
        iact: base1to0(iact),
        message: message
    };
}
exports.solveQP = solveQP;
}(numeric));
/*
Shanti Rao sent me this routine by private email. I had to modify it
slightly to work on Arrays instead of using a Matrix object.
It is apparently translated from http://stitchpanorama.sourceforge.net/Python/svd.py
*/

numeric.svd= function svd(A) {
    var temp;
//Compute the thin SVD from G. H. Golub and C. Reinsch, Numer. Math. 14, 403-420 (1970)
	var prec= numeric.epsilon; //Math.pow(2,-52) // assumes double prec
	var tolerance= 1.e-64/prec;
	var itmax= 50;
	var c=0;
	var i=0;
	var j=0;
	var k=0;
	var l=0;
	
	var u= numeric.clone(A);
	var m= u.length;
	
	var n= u[0].length;
	
	if (m < n) throw "Need more rows than columns"
	
	var e = new Array(n);
	var q = new Array(n);
	for (i=0; i<n; i++) e[i] = q[i] = 0.0;
	var v = numeric.rep([n,n],0);
//	v.zero();
	
 	function pythag(a,b)
 	{
		a = Math.abs(a)
		b = Math.abs(b)
		if (a > b)
			return a*Math.sqrt(1.0+(b*b/a/a))
		else if (b == 0.0) 
			return a
		return b*Math.sqrt(1.0+(a*a/b/b))
	}

	//Householder's reduction to bidiagonal form

	var f= 0.0;
	var g= 0.0;
	var h= 0.0;
	var x= 0.0;
	var y= 0.0;
	var z= 0.0;
	var s= 0.0;
	
	for (i=0; i < n; i++)
	{	
		e[i]= g;
		s= 0.0;
		l= i+1;
		for (j=i; j < m; j++) 
			s += (u[j][i]*u[j][i]);
		if (s <= tolerance)
			g= 0.0;
		else
		{	
			f= u[i][i];
			g= Math.sqrt(s);
			if (f >= 0.0) g= -g;
			h= f*g-s
			u[i][i]=f-g;
			for (j=l; j < n; j++)
			{
				s= 0.0
				for (k=i; k < m; k++) 
					s += u[k][i]*u[k][j]
				f= s/h
				for (k=i; k < m; k++) 
					u[k][j]+=f*u[k][i]
			}
		}
		q[i]= g
		s= 0.0
		for (j=l; j < n; j++) 
			s= s + u[i][j]*u[i][j]
		if (s <= tolerance)
			g= 0.0
		else
		{	
			f= u[i][i+1]
			g= Math.sqrt(s)
			if (f >= 0.0) g= -g
			h= f*g - s
			u[i][i+1] = f-g;
			for (j=l; j < n; j++) e[j]= u[i][j]/h
			for (j=l; j < m; j++)
			{	
				s=0.0
				for (k=l; k < n; k++) 
					s += (u[j][k]*u[i][k])
				for (k=l; k < n; k++) 
					u[j][k]+=s*e[k]
			}	
		}
		y= Math.abs(q[i])+Math.abs(e[i])
		if (y>x) 
			x=y
	}
	
	// accumulation of right hand gtransformations
	for (i=n-1; i != -1; i+= -1)
	{	
		if (g != 0.0)
		{
		 	h= g*u[i][i+1]
			for (j=l; j < n; j++) 
				v[j][i]=u[i][j]/h
			for (j=l; j < n; j++)
			{	
				s=0.0
				for (k=l; k < n; k++) 
					s += u[i][k]*v[k][j]
				for (k=l; k < n; k++) 
					v[k][j]+=(s*v[k][i])
			}	
		}
		for (j=l; j < n; j++)
		{
			v[i][j] = 0;
			v[j][i] = 0;
		}
		v[i][i] = 1;
		g= e[i]
		l= i
	}
	
	// accumulation of left hand transformations
	for (i=n-1; i != -1; i+= -1)
	{	
		l= i+1
		g= q[i]
		for (j=l; j < n; j++) 
			u[i][j] = 0;
		if (g != 0.0)
		{
			h= u[i][i]*g
			for (j=l; j < n; j++)
			{
				s=0.0
				for (k=l; k < m; k++) s += u[k][i]*u[k][j];
				f= s/h
				for (k=i; k < m; k++) u[k][j]+=f*u[k][i];
			}
			for (j=i; j < m; j++) u[j][i] = u[j][i]/g;
		}
		else
			for (j=i; j < m; j++) u[j][i] = 0;
		u[i][i] += 1;
	}
	
	// diagonalization of the bidiagonal form
	prec= prec*x
	for (k=n-1; k != -1; k+= -1)
	{
		for (var iteration=0; iteration < itmax; iteration++)
		{	// test f splitting
			var test_convergence = false
			for (l=k; l != -1; l+= -1)
			{	
				if (Math.abs(e[l]) <= prec)
				{	test_convergence= true
					break 
				}
				if (Math.abs(q[l-1]) <= prec)
					break 
			}
			if (!test_convergence)
			{	// cancellation of e[l] if l>0
				c= 0.0
				s= 1.0
				var l1= l-1
				for (i =l; i<k+1; i++)
				{	
					f= s*e[i]
					e[i]= c*e[i]
					if (Math.abs(f) <= prec)
						break
					g= q[i]
					h= pythag(f,g)
					q[i]= h
					c= g/h
					s= -f/h
					for (j=0; j < m; j++)
					{	
						y= u[j][l1]
						z= u[j][i]
						u[j][l1] =  y*c+(z*s)
						u[j][i] = -y*s+(z*c)
					} 
				}	
			}
			// test f convergence
			z= q[k]
			if (l== k)
			{	//convergence
				if (z<0.0)
				{	//q[k] is made non-negative
					q[k]= -z
					for (j=0; j < n; j++)
						v[j][k] = -v[j][k]
				}
				break  //break out of iteration loop and move on to next k value
			}
			if (iteration >= itmax-1)
				throw 'Error: no convergence.'
			// shift from bottom 2x2 minor
			x= q[l]
			y= q[k-1]
			g= e[k-1]
			h= e[k]
			f= ((y-z)*(y+z)+(g-h)*(g+h))/(2.0*h*y)
			g= pythag(f,1.0)
			if (f < 0.0)
				f= ((x-z)*(x+z)+h*(y/(f-g)-h))/x
			else
				f= ((x-z)*(x+z)+h*(y/(f+g)-h))/x
			// next QR transformation
			c= 1.0
			s= 1.0
			for (i=l+1; i< k+1; i++)
			{	
				g= e[i]
				y= q[i]
				h= s*g
				g= c*g
				z= pythag(f,h)
				e[i-1]= z
				c= f/z
				s= h/z
				f= x*c+g*s
				g= -x*s+g*c
				h= y*s
				y= y*c
				for (j=0; j < n; j++)
				{	
					x= v[j][i-1]
					z= v[j][i]
					v[j][i-1] = x*c+z*s
					v[j][i] = -x*s+z*c
				}
				z= pythag(f,h)
				q[i-1]= z
				c= f/z
				s= h/z
				f= c*g+s*y
				x= -s*g+c*y
				for (j=0; j < m; j++)
				{
					y= u[j][i-1]
					z= u[j][i]
					u[j][i-1] = y*c+z*s
					u[j][i] = -y*s+z*c
				}
			}
			e[l]= 0.0
			e[k]= f
			q[k]= x
		} 
	}
		
	//vt= transpose(v)
	//return (u,q,vt)
	for (i=0;i<q.length; i++) 
	  if (q[i] < prec) q[i] = 0
	  
	//sort eigenvalues	
	for (i=0; i< n; i++)
	{	 
	//writeln(q)
	 for (j=i-1; j >= 0; j--)
	 {
	  if (q[j] < q[i])
	  {
	//  writeln(i,'-',j)
	   c = q[j]
	   q[j] = q[i]
	   q[i] = c
	   for(k=0;k<u.length;k++) { temp = u[k][i]; u[k][i] = u[k][j]; u[k][j] = temp; }
	   for(k=0;k<v.length;k++) { temp = v[k][i]; v[k][i] = v[k][j]; v[k][j] = temp; }
//	   u.swapCols(i,j)
//	   v.swapCols(i,j)
	   i = j	   
	  }
	 }	
	}
	
	return {U:u,S:q,V:v}
};

return numeric;

});
// Helper functions for computing distance.
//
// The name of this should probably be changed, once we learn what other
// kinds of things we're including here.

define('math/distance',['require','math/builtin','numeric'],function (require) {
  var Builtin = require('math/builtin');
  var Numeric = require('numeric');

  var Distance = {
    // sqrt(x^2 + y^2), computed to avoid overflow and underflow.
    // http://en.wikipedia.org/wiki/Hypot
    hypot: function(x, y) {
      if(x === 0 && y === 0) {
        return 0;
      }
      if (Math.abs(x) > Math.abs(y)) {
        return Math.abs(x) * Math.sqrt((y/x) * (y/x) + 1);
      } else {
        return Math.abs(y) * Math.sqrt((x/y) * (x/y) + 1);
      }
    },

    // (x1 + x2)/2, computed to avoid overflow.
    mean: function (x1, x2) {
      return ((x1 > 0) === (x2 > 0)) ? x1 + 0.5*(x2 - x1) : 0.5*(x1 + x2);
    },

    dot: function(x1, y1, x2, y2) {
      return x1*x2 + y1*y2;
    },

    // Consider the line extending the segment, parameterized as
    // v1 + t (v2 - v1), where p, v1, and v2 are (xp, yp), (x1, y1), and
    // (x2, y2) respectively.
    //
    // Return the value of the parameter t for the projected point of p onto
    // the line through the segment.
    //
    // It falls where t = [(p-v) . (w-v)] / |w-v|^2
    //
    // Returns 0 in the degenerate case where v1 === v2.
    pointToSegmentParameter: function(xp, yp, x1, y1, x2, y2) {
      var line_length = this.hypot(x2 - x1, y2 - y1);

      // Degenerate case of a point to a point
      if (line_length === 0) return 0;

      var t = this.dot(
        (xp - x1)/line_length,
        (yp - y1)/line_length,
        (x2 - x1)/line_length,
        (y2 - y1)/line_length
      );

      return t;
    },

    closestPointOnSegment: function (xp, yp, x1, y1, x2, y2) {
      var t = this.pointToSegmentParameter(xp, yp, x1, y1, x2, y2);
      
      if (t <= 0) return [x1, y1];
      if (t >= 1) return [x2, y2];
      return [x1 + t*(x2 - x1), y1 + t*(y2 - y1)];
    },

    // Shortest distance from a point to a line segment
    // http://stackoverflow.com/questions/849211/shortest-distance-between-a-point-and-a-line-segment
    pointToSegment: function (xp, yp, x1, y1, x2, y2) {
      var p = this.closestPointOnSegment(xp, yp, x1, y1, x2, y2);
      return this.hypot(xp - p[0], yp - p[1]);
    },

    // (Near) 0 if x3, y3 lies on the line from x1, y1 to x2, y2.
    // Positive if x3, y3 is on the left of the line, so that the points form a
    // triangle with clockwise orientation.
    isLine: function (x1, y1, x2, y2, x3, y3) {
      var S = Numeric.svd([
        [x1, y1, 1],
        [x2, y2, 1],
        [x3, y3, 1]
      ]).S;
      return Builtin.approx(S[S.length - 1]/S[0], 0);
    },

    isCircle: function (x1, y1, x2, y2, x3, y3, x4, y4) {
      var S = Numeric.svd([
        [x1*x1 + y1*y1, x1, y1, 1],
        [x2*x2 + y2*y2, x2, y2, 1],
        [x3*x3 + y3*y3, x3, y3, 1],
        [x4*x4 + y4*y4, x4, y4, 1]
      ]).S;
      return Builtin.approx(S[S.length - 1]/S[0], 0);
    },

    // (Near) 0 if x6, y6 lies on the conic defined by the first five points.
    // I don't quite know how to interpret the sign for a general conic.
    isConic: function (x1, y1, x2, y2, x3, y3, x4, y4, x5, y5, x6, y6) {
      var S =  Numeric.svd([
        [x1*x1, y1*y1, 2*x1*y1, x1, y1, 1],
        [x2*x2, y2*y2, 2*x2*y2, x2, y2, 1],
        [x3*x3, y3*y3, 2*x3*y3, x3, y3, 1],
        [x4*x4, y4*y4, 2*x4*y4, x4, y4, 1],
        [x5*x5, y5*y5, 2*x5*y5, x5, y5, 1],
        [x6*x6, y6*y6, 2*x6*y6, x6, y6, 1]
      ]).S;
      return Builtin.approx(S[S.length - 1]/S[0], 0);
    },

    conicQuadraticParameters: function (x1, y1, x2, y2, x3, y3, x4, y4, x5, y5) {
      return {
        a: Numeric.det([
          [y1*y1, 2*x1*y1, x1, y1, 1],
          [y2*y2, 2*x2*y2, x2, y2, 1],
          [y3*y3, 2*x3*y3, x3, y3, 1],
          [y4*y4, 2*x4*y4, x4, y4, 1],
          [y5*y5, 2*x5*y5, x5, y5, 1]
        ]),

        b: Numeric.det([
          [x1*x1, y1*y1, x1, y1, 1],
          [x2*x2, y2*y2, x2, y2, 1],
          [x3*x3, y3*y3, x3, y3, 1],
          [x4*x4, y4*y4, x4, y4, 1],
          [x5*x5, y5*y5, x5, y5, 1]
        ]),

        c: -Numeric.det([
          [x1*x1, 2*x1*y1, x1, y1, 1],
          [x2*x2, 2*x2*y2, x2, y2, 1],
          [x3*x3, 2*x3*y3, x3, y3, 1],
          [x4*x4, 2*x4*y4, x4, y4, 1],
          [x5*x5, 2*x5*y5, x5, y5, 1]
        ])
      };
    },

    // Classify a set of 6 points as line, circle, parabola, hyperbola, ellipse, or none for not a conic.
    classifyConic: function (x1, y1, x2, y2, x3, y3, x4, y4, x5, y5, x6, y6) {
      if (Distance.isLine(x1, y1, x3, y3, x6, y6)) return 'line';
      if (Distance.isCircle(x1, y1, x2, y2, x5, y5, x6, y6)) return 'circle';
      if (!Distance.isConic(x1, y1, x2, y2, x3, y3, x4, y4, x5, y5, x6, y6)) return 'none';
      
      var p = Distance.conicQuadraticParameters(x1, y1, x2, y2, x3, y3, x4, y4, x5, y5);
      var S = Numeric.svd([[p.a, p.b], [p.b, p.c]]).S;

      if (Builtin.approx(S[S.length - 1]/S[0], 0, 20)) return 'parabola';
      return (p.b*p.b > p.a*p.c) ? 'hyperbola' : 'ellipse';

    }
  };

  return Distance;
});

// Utilites for finding and refining points of interest in samled functions.
//
// bisect* are low level functions take endpoints and a function, and return
// a single [x, f(x)] pair, where f is the function that was passed in, or
// null if a non-finite value of the function is encountered during
// evaluation. These methods have preconditions on the endpoints that callers
// are expected to enforce (because they are called recursively). They bisect
// to machine precision.
//
// find* are higher level. They take an array of segments and a function.
// Each segment is an array of points representing a polyline that
// approximates the function over a range where the function is expected to be
// continuous. No more than one zero and one extremum will be returned between
// individual point pairs in the segments list.
//
// findPOIs collects the results of all the find* methods together.


define('math/poi',['require','./builtin','./distance'],function(require){
  var BuiltIn = require('./builtin');
  var Distance = require('./distance');

// floatMiddle is a helper function for bisecting floats. Necessary because
// floats are denser near 0 than they are elsewhere, so using a normal mean
// results in slow bisection to 0.
//
// This function returns the arithmetic mean if both numbers have
// magnitude larger than 1e-2, 0 if the numbers are small and have opposite
// signs, and the signed geometric mean if the numbers have the same sign. The
// geometric mean bisects the exponent instead of the mantissa, which is what
// we want near 0.

function floatMiddle(a, b) {
  var tmp;
  if (a > b) {
    tmp = a; a = b; b = tmp;
  }
  var aPos = a > 0;
  var bPos = b > 0;
  var aLarge = Math.abs(a) > 1e-2;
  var bLarge = Math.abs(b) > 1e-2;
  if (aLarge || bLarge) return Distance.mean(a, b);
  if (a === 0) return b*Math.abs(b);
  if (b === 0) return a*Math.abs(a);
  if (aPos !== bPos) return 0;
  var gMean = (aPos) ? Math.sqrt(a*b) : -Math.sqrt(a*b);
  // Check if the geometric mean actually lies between the numbers (it might
  // not because of floating point rounding). If it does not, return the
  // normal mean, which is computed in a way that guarantees it will be
  // between the inputs.
  return ((gMean >= a) && (b >= gMean)) ? gMean : Distance.mean(a, b);
}

function bisectZero(x0, y0, x2, y2, fn) {
  // Preconditions:
  // 1. y0 and y2 are finite and non-zero and have opposite sign
  if (!(isFinite(y0) && isFinite(y2) && (y0 < 0) !== (y2 < 0))) {
    console.log('bisectZero called with bad y values', [y0, y2]);
    return;
  }

  while (true) {
    var x1 = floatMiddle(x0, x2);
    var y1 = fn(x1);
    
    if (!isFinite(y1)) return null;

    // We can't bisect any further; return x for side with y closer to 0.
    if (x1 === x0 || x1 === x2) {
      return Math.abs(y0) <= Math.abs(y2) ? [x0, y0] : [x2, y2];
    }

    // Found a 0 early. Check if we're on a flat, and return the center of it.
    if (y1 === 0) return flatCenter(x0, y0, x1, y1, x2, y2, fn);

    // Bisect on side that brackets zero
    if ((y0 < 0) !== (y1 < 0)) {
      x2 = x1; y2 = y1;
    } else {
      x0 = x1; y0 = y1;
    }
  }
}

// Returns the center of a possibly flat region with constant value y1
function flatCenter(x0, y0, x1, y1, x2, y2, fn) {
  // Preconditions:
  // 1. x0 < x1 < x2

  var edge;
  if (!isFinite(y1)) return;

  if (!isFinite(y0)) {
    edge = bisectFinite(x0, y0, x1, y1, fn);
    x0 = edge[0];
    y0 = edge[1];
  }

  if (!isFinite(y2)) {
    edge = bisectFinite(x1, y1, x2, y2, fn);
    x2 = edge[0];
    y2 = edge[1];
  }

  var flatLeft, flatRight;

  if (y0 === y1) {
    flatLeft = [x0, y0];
  } else {
    flatLeft = bisectConstant(x0, y0, x1, y1, fn, y1);
  }
  
  if (y2 === y1) {
    flatRight = [x2, y2];
  } else {
    flatRight = bisectConstant(x1, y1, x2, y2, fn, y1);
  }

  var xc = floatMiddle(flatLeft[0], flatRight[0]);
  return [xc, fn(xc)];
}

function bisectFinite(x0, y0, x2, y2, fn) {
  // Preconditions:
  // 1. isFinite(y0) !== isFinite(y2)
  if (isFinite(y0) === isFinite(y2)) {
    console.log('bisectFinite called with bad y values', [y0, y2]);
    return;
  }
  
  while (true) {
    var x1 = floatMiddle(x0, x2);
    var y1 = fn(x1);

    // We can't bisect any further; return [x, y] pair for side that is finite.
    if (x1 === x0 || x1 === x2) return isFinite(y0) ? [x0, y0]: [x2, y2];

    // Bisect on side that brackets zero
    if (isFinite(y1) !== isFinite(y0)) {
      x2 = x1; y2 = y1;
    } else {
      x0 = x1; y0 = y1;
    }
  }
}

function bisectConstant(x0, y0, x2, y2, fn, constant) {
  // Preconditions:
  // 1. (y0 === constant) !== (y2 === constant)
  if ((y0 === constant) === (y2 === constant)) {
    console.log('bisectConstant called with bad y values', [y0, y2, constant]);
    return;
  }
  
  while (true) {
    var x1 = floatMiddle(x0, x2);
    var y1 = fn(x1);
    
    // We can't bisect any further; return [x, y] pair for side with
    // y === constant
    if (x1 === x0 || x1 === x2) return (y0 === constant) ? [x0, y0]: [x2, y2];
    
    if ((y1 === constant) !== (y0 === constant)) {
      x2 = x1; y2 = y1;
    } else {
      x0 = x1; y0 = y1;
    }
  }
}

function bisectExtremum(x0, y0, x2, y2, x4, y4, fn) {
  // Preconditions:
  // 1. x0 < x2 < x4
  // 2. y0, y2, and y4 are finite, non-equal, and y2 > y0 === y2 > y4.
  if (!(x0 < x2 && x2 < x4)) {
    console.log('bisectExtremum called with bad x values', [x0, x2, x4]);
    return;
  }
  if (!(
    (isFinite(y0) && isFinite(y2) && isFinite(y4)) &&
    (y0 !== y2 && y2 !== y4) &&
    (y2 > y0) === (y2 > y4)
  )) {
    console.log('bisectExtremum called with bad y values', [y0, y2, y4]);
    return;
  }
  
  while (true) {
    var x1 = floatMiddle(x0, x2);
    var y1 = fn(x1);
    var x3 = floatMiddle(x2, x4);
    var y3 = fn(x3);
    
    if (!isFinite(y1) || !isFinite(y3)) return null;
    
    // We can't bisect any further; return x and y for most extreme value
    if (x1 === x0 || x1 === x2 || x3 === x2 || x3 === x4) {
      if ((y1 > y2) === (y2 > y0)) return [x1, y1];
      if ((y3 > y2) === (y2 > y0)) return [x3, y3];
      return [x2, y2];
    }
    
    // We've hit a flat. Find its edges and return x and y for its center.
    if (y1 === y2 || y3 === y2) {
      return flatCenter(x0, y0, x2, y2, x4, y4, fn);
    }
    
    // Bisect on side that brackets zero
    if ((y1 > y0) === (y2 > y0) && (y1 > y0) === (y1 > y2)) {
      x4 = x2; y4 = y2; x2 = x1; y2 = y1;
    } else if ((y3 > y4) === (y2 > y4) && (y3 > y2) === (y3 > y4)) {
      x0 = x2; y0 = y2; x2 = x3; y2 = y3;
    } else {
      x0 = x1; y0 = y1; x4 = x3; y4 = y3;
    }
  }
}

// Returns larget jump among 4 points. Used in final step of bisectJump
function largestJump(x0, y0, x1, y1, x2, y2, x3, y3) {
  // Preconditions:
  // 1. y0, y1, y2, and y3 are all finite
  var d1 = Math.abs(y1 - y0);
  var d2 = Math.abs(y2 - y1);
  var d3 = Math.abs(y3 - y2);
  
  if (d1 > d2 && d1 > d3) return [[x0, y0], [x1, y1]];
  if (d3 > d2 && d3 > d1) return [[x2, y2], [x3, y3]];
  return [[x1, y1], [x2, y2]];
}

// Tries to find the largest jump in an interval. Returns left side and right
// side of jump as [[xl, yl], [xr, yr]], or null if no jump was found.
// Tolerance is allowed to be 0, and this works for some smooth functions,
// but returns false positives for others.
function bisectJump(x0, y0, x2, y2, x4, y4, fn, tolerance) {
  // Preconditions:
  // 1. x0 < x2 < x4
  // 2. y0, y2, and y4 are all finite.
  // Also expect x2 - x0 ~= x4 - x2
  if (!(x0 < x2 && x2 < x4)) {
    console.log('bisectJump called with bad x values', [x0, x2, x4]);
    return;
  }
  if (!(isFinite(y0) && isFinite(y2) && isFinite(y4))) {
    console.log('bisectJump called with bad y values', [y0, y2, y4]);
    return;
  }

  while (true) {
    var x1 = floatMiddle(x0, x2);
    var y1 = fn(x1);
    var x3 = floatMiddle(x2, x4);
    var y3 = fn(x3);
    var dy1 = Math.abs(y1 - Distance.mean(y0, y2));
    var dy3 = Math.abs(y3 - Distance.mean(y2, y4));
    var left;
    var right;
    if (!tolerance) tolerance = 0;

    if (dy1 <= tolerance && dy3 <= tolerance) return null;

    // An undefined region counts as a jump.
    if (!isFinite(y1)) {
      left = bisectFinite(x0, y0, x1, y1, fn);
      right = bisectFinite(x1, y1, x4, y4, fn);
      return [left, right];
    }

    if (!isFinite(y3)) {
      left = bisectFinite(x0, y0, x3, y3, fn);
      right = bisectFinite(x3, y3, x4, y4, fn);
      return [left, right];
    }

    if ((x1 === x0 || x1 === x2) && (x3 === x2 || x3 === x4)) {
      if (Math.abs(y2 - y0) > Math.abs(y4 - y2)) {
        left = [x0, y0];
        right = [x2, y2];
      } else {
        left = [x2, y2];
        right = [x4, y4];
      }
      return [left, right];
    } else if (x1 === x0 || x1 === x2) {
      return largestJump(x0, y0, x2, y2, x3, y3, x4, y4);
    } else if (x3 === x2 || x3 === x4) {
      return largestJump(x0, y0, x1, y1, x2, y2, x4, y4);
    }

    if (dy1 > dy3) {
      x4 = x2; y4 = y2; x2 = x1; y2 = y1;
    } else {
      x0 = x2; y0 = y2; x2 = x3; y2 = y3;
    }
  }
}

function findZeros(segments, fn) {
  var segment;
  var accumulator = { x: [], y: [] };
  var x0;
  var y0;
  var x2;
  var y2;
  var zero;
  var flatLeft;
  for (var i=0, li=segments.length; i<li; i++) {
    segment = segments[i];
    flatLeft = undefined;
    if (segment[1] === 0) flatLeft = [segment[0], segment[1]];
    for (var j=0, lj=segment.length; j<lj-2; j = j+2) {
      x0 = segment[j];
      y0 = segment[j+1];
      x2 = segment[j+2];
      y2 = segment[j+3];

      if (!flatLeft) {
        if (y2 === 0) {
          // Entering left side of a potential flat. Save its position.
          flatLeft = [x0, y0];
        } else if ((y0 < 0) !== (y2 < 0)) {
          zero = bisectZero(x0, y0, x2, y2, fn);
          if (zero) {
            accumulator.x.push(zero[0]);
            accumulator.y.push(zero[1]);
          }
        }
      } else {
        if (y2 !== 0) {
          // Leaving right side of a flat. Add its center as a root.
          // Don't label zeros that start on segment boundaries.
          if (flatLeft[0] !== segment[0]) {
            zero = flatCenter(flatLeft[0], flatLeft[1], x0, y0, x2, y2, fn);
            accumulator.x.push(zero[0]);
            accumulator.y.push(zero[1]);
          }
          flatLeft = undefined;
        }
        // Otherwise we're in the middle of the flat; do nothing
      }
    }
    // Don't label zero that ends on a segment boundary.
  }
  
  return accumulator;
}

function findExtrema(segments, fn) {
  var segment;
  var accumulator = { x: [], y: [] };
  var x0;
  var y0;
  var x2;
  var y2;
  var x4;
  var y4;
  var extremum;
  var flatLeft;
  for (var i=0, li=segments.length; i<li; i++) {
    segment = segments[i];
    for (var j=0, lj=segment.length; j<lj - 4; j = j+2) {
      x0 = segment[j];
      y0 = segment[j+1];
      x2 = segment[j+2];
      y2 = segment[j+3];
      x4 = segment[j+4];
      y4 = segment[j+5];
      
      //TODO handle extremal endpoints.
      if (!(isFinite(y0) && isFinite(y2) && isFinite(y4))) continue;

      if (y0 !== y2 && y2 === y4) {
        // Entering left side of a flat. Save its position.
        flatLeft = [x0, y0];
      } else if (y0 === y2 && y2 !== y4 && flatLeft) {
        // Leaving right side of a flat.
        if ((y2 > flatLeft[1]) === (y2 > y4)) {
          // Flat is an extremum. Push it's center.
          extremum = flatCenter(flatLeft[0], flatLeft[1], x2, y2, x4, y4, fn);
          accumulator.x.push(extremum[0]);
          accumulator.y.push(extremum[1]);
        }
        flatLeft = undefined;
      } else if (y0 === y2 && y2 === y4) {
        // Middle of a flat, do nothing
      } else if ((y2 > y0) === (y2 > y4)) {
        if (fn.derivative) {
          // If we have derivative information, find zeros of the derivative
          // to find extrema. This gives greater accuracy in the argmax/argmin
          // because the original function is flat at the extrema, but its
          // derivative is (usually) not.
          
          // Make sure we satisfy prereqs of bisectZero
          if ((fn.derivative(x0) > 0) === (fn.derivative(x4) > 0)) continue;
          extremum = bisectZero(
            x0, fn.derivative(x0),
            x4, fn.derivative(x4),
            fn.derivative
          );
          // Currently treat maxima and minima the same
          if (extremum) {
            accumulator.x.push(extremum[0]);
            accumulator.y.push(fn(extremum[0]));
          }
        } else {
          extremum = bisectExtremum(x0, y0, x2, y2, x4, y4, fn);
          // Currently treat maxima and minima the same
          if (extremum) {
            accumulator.x.push(extremum[0]);
            accumulator.y.push(extremum[1]);
          }
        }
      }
    }
  }
  return accumulator;
}

function findIntercept(segments, fn) {
  var intercept = fn(0);
  if (!isFinite(intercept)) return { x: [], y: []};
  return { x: [ 0 ], y: [ fn(0) ] };
}

function findEdges(segments, fn) {
  var slen = segments.length;
  var accumulator = { x: [], y: [] };
  //TODO work out robust system for labeling holes so that we can label all
  // edges.
  //
  // For now, only label edges that are close to zero as zeros.
  
  for (var i = 0; i < slen; i++) {
    var segment = segments[i];
    if (parseFloat(segment[1].toFixed(7)) === 0) {
      accumulator.x.push(segment[0]);
      accumulator.y.push(segment[1]);
    }
    
    if (parseFloat(segment[segment.length - 1].toFixed(7)) === 0) {
      accumulator.x.push(segment[segment.length - 2]);
      accumulator.y.push(segment[segment.length -1]);
    }
  }
  return accumulator;
}

function findPOIs(segments, fn) {
  var zeros = findZeros(segments, fn);
  var edges = findEdges(segments, fn);
  
  // Not displaying edges right now; combine them with zeros.
  zeros.x.push.apply(zeros.x, edges.x);
  zeros.y.push.apply(zeros.y, edges.y);
  
  return {
    zeros: zeros,
    intercept: findIntercept(segments, fn),
    extrema: findExtrema(segments, fn)
  };
}

function findIntersections (differenceSamples, fn1, fn2) {
  var differenceFn = function (x) { return fn2(x) - fn1(x); };

  var zeros = findZeros(differenceSamples, differenceFn);
  var i, elen, zlen;

  // Find tangent intersections.
  var extrema = findExtrema(differenceSamples, differenceFn);
  for (i = 0, elen = extrema.x.length; i < elen; i++) {
    if (BuiltIn.approx(extrema.y[i], 0)) {
      zeros.x.push(extrema.x[i]);
      zeros.y.push(extrema.y[i]);
    }
  }

  // Find original function intersection y values.
  for (i = 0, zlen = zeros.x.length; i < zlen; i++) {
    zeros.y[i] = fn1(zeros.x[i]);
  }
  return zeros;
}

return {
  bisectJump: bisectJump,
  bisectExtremum: bisectExtremum,
  bisectFinite: bisectFinite,
  bisectZero: bisectZero,
  findExtrema: findExtrema,
  findZeros: findZeros,
  findPOIs: findPOIs,
  findIntersections: findIntersections,

  //Enums for POI type
  INTERSECTION: 1001,
  ZERO: 1002,
  INTERCEPT: 1003,
  EXTREMUM: 1004,
  EDGE: 1005,
  DEFINITION: 1006
};

});

define('graphing/graphmode',{
  X: 1,
  Y: 2,
  XYPOINT: 3,
  XYPOINT_MOVABLE: 4,
  PARAMETRIC: 5,
  POLAR: 6,
  POLYGONFILL: 7
});

define('math/evalframe',['require','pjs'],function(require){
  var P = require('pjs');

var EvalFrame = P(function(frame){
  frame.init = function(parentFrame){
    if(parentFrame instanceof EvalFrame){
      this.parentFrame = parentFrame;
    }
    else{
      this.parentFrame = null;
    }
    this.variables = {};
    this.functions = {};
    this.evalStrings = {};
    this.definitionIds = {};
    if(this.parentFrame){
      for(var variable in this.parentFrame.evalStrings){
        this.evalStrings[variable] = this.parentFrame.getEvalStrings(variable);
      }
    }
  };

  frame.setVariable = function(name, value){
    this.variables[name] = value;
  };

  frame.getVariable = function(name){
    if(this.variables.hasOwnProperty(name)){
      return this.variables[name];
    }

    if(this.parentFrame){
      return this.parentFrame.getVariable(name);
    }

    throw("Variable '"+name+"' not defined");
  };

  frame.setDefinitionId = function (name, id) {
    this.definitionIds[name] = id;
  };

  frame.getDefinitionId = function (name) {
    return this.definitionIds[name];
  };

  frame.setFunction = function(name, arity, body, tree, args, source){
    this.functions[name] = {arity: arity, body:body, tree:tree, source:source, args:args};
  };

  frame.hasFunction = function(name){
    if(this.functions.hasOwnProperty(name)){
      return true;
    }
    if(this.parentFrame){
      return this.parentFrame.hasFunction(name);
    }
    return false;
  };

  frame.hasFunctionWithArity = function(name, arity){
    if(this.functions.hasOwnProperty(name) && this.functions[name].arity == arity){
      return true;
    }
    if(this.parentFrame){
      return this.parentFrame.hasFunction(name);
    }
    return false;
  };

  frame.hasVariable = function(name){
    if (this.variables.hasOwnProperty(name)){
      return true;
    }
    if(this.parentFrame){
      return this.parentFrame.hasVariable(name);
    }
    return false;
  };

  frame.getFunctionTree = function(name){
    if(this.functions.hasOwnProperty(name)){
      var f = this.functions[name];
      return f.tree;
    }

    if(this.parentFrame) return this.parentFrame.getFunctionTree(name);
    
    throw("Function '"+name+"' not defined");
  };

  frame.callFunction = function(name, args){
    if(this.functions.hasOwnProperty(name)){
      var f = this.functions[name];
      if(f.arity == args.length){
        return f.body.apply(null, args);
      }
      throw("Function " + name + " expects " + f.arity + " arguments, but was called with " + args.length);
    }
    
    if (this.parentFrame){
      return this.parentFrame.callFunction(name, args);
    }

    throw("Function '"+name+"' not defined");
  };

  frame.defines = function(name){
    return this.hasVariable(name) || this.hasFunction(name);
  };

  frame.arity = function(name){
    if(this.hasVariable(name)) return 0;
    if(this.hasFunction(name)) return this.functions[name].arity;
    if(this.parentFrame){
      return this.parentFrame.arity(name);
    }
  };

  //Needed for compilation.  Have different semantics (don't go up scope chain) for now.  Don't know if that's right
  frame.setEvalStrings = function(name, s){
    this.evalStrings[name] = s;
  };

  frame.getEvalStrings = function(name){
    if(this.evalStrings.hasOwnProperty(name)){
      return this.evalStrings[name];
    }
    else{
      return {expression:name, statements:''};
    }
  };

  frame.functionMap = function(leafOnly){
    var allFunctions = {};
    if(this.parentFrame && !leafOnly){
      allFunctions = this.parentFrame.functionMap();
    }
    for(var name in this.functions){
      if(this.functions.hasOwnProperty(name)){
        allFunctions[name] = this.functions[name].body;
      }
    }
    return allFunctions;
  };

  frame.leafFunctionMap = function(){
    return this.functionMap(true);
  };

  frame.functionSourceMap = function(leafOnly){
    var compiledFunctions = {};
    if(this.parentFrame && !leafOnly){
      compiledFunctions = this.parentFrame.functionSourceMap();
    }
    for(var name in this.functions){
      if(this.functions.hasOwnProperty(name) && this.functions[name].source){
        compiledFunctions[name] = {
          args: this.functions[name].args,
          source: this.functions[name].source
        };
      }
    }
    return compiledFunctions;
  };

  frame.leafFunctionSourceMap = function(){
    return this.functionSourceMap(true);
  };
});

return EvalFrame;

});

//Use this table to get rid of all the string comparisons used to interpret comparators
define('math/comparators',['require'],function(require){

var ComparatorTable = {
   '<': {inclusive: false, direction: -1},
  '!=': {inclusive: false, direction:  0},
   '>': {inclusive: false, direction:  1},
  '<=': {inclusive: true,  direction: -1},
  '=': {inclusive: true,  direction:  0},
  '>=': {inclusive: true,  direction:  1}
};

var getComparator = function(inclusive, direction){
  switch(direction){
    case -1:
      return (inclusive ? '<=' : '<');
    case 0:
      return (inclusive ? '=' : '!=');
    case 1:
      return (inclusive ? '>=' : '>');
    default:
      throw "Programming error.  Comparators must have a direction of -1, 0, or 1";
  }
};

return{
  table: ComparatorTable,
  get: getComparator
};

});

define('parser',[], function(){
var parser = {trace: function trace() { },
yy: {},
symbols_: {"error":2,"sentence":3,"expr":4,"EOF":5,"assignment":6,"equation":7,"function_declaration":8,"ordered_pair_list":9,"double_inequality":10,"boolean":11,"identifier":12,"=":13,"FUNCTION_PROTOTYPE":14,",":15,"comparator":16,"IDENTIFIER_BASE":17,"ordered_pair_list_elements":18,"ordered_pair":19,"[":20,"]":21,"(":22,")":23,"expr_sum":24,"<":25,">":26,">=":27,"<=":28,"+":29,"expr_product":30,"-":31,"expr_atom_impmul":32,"*":33,"expr_atom":34,"/":35,"exponent":36,"^N":37,"^I":38,"^":39,"{":40,"}":41,"function_call":42,"function_call_unary":43,"trig_function_call":44,"log_function_call":45,"left|":46,"right|":47,"FRAC":48,"SQRT":49,"!":50,"repeated_operator":51,"DERIVATIVE":52,"expr_piecewise":53,"constant":54,"NUMBER":55,"repeated_operator_symbol":56,"SUM":57,"PROD":58,"_":59,"{_visible":60,"piecewise_list":61,"}_visible":62,"incomplete_piecewise_list":63,"piecewise_element":64,":":65,"trig_function":66,"TRIG_FUNCTION":67,"log_prefix":68,"LN":69,"LOG":70,"LOG_BASE_N":71,"function_argument_list":72,"$accept":0,"$end":1},
terminals_: {2:"error",5:"EOF",13:"=",14:"FUNCTION_PROTOTYPE",15:",",17:"IDENTIFIER_BASE",20:"[",21:"]",22:"(",23:")",25:"<",26:">",27:">=",28:"<=",29:"+",31:"-",33:"*",35:"/",37:"^N",38:"^I",39:"^",40:"{",41:"}",46:"left|",47:"right|",48:"FRAC",49:"SQRT",50:"!",52:"DERIVATIVE",55:"NUMBER",57:"SUM",58:"PROD",59:"_",60:"{_visible",62:"}_visible",65:":",67:"TRIG_FUNCTION",69:"LN",70:"LOG",71:"LOG_BASE_N"},
productions_: [0,[3,2],[3,2],[3,2],[3,2],[3,2],[3,2],[3,2],[3,3],[3,2],[3,4],[3,1],[6,3],[6,3],[7,3],[10,5],[12,1],[9,1],[18,1],[18,3],[19,5],[19,5],[4,1],[16,1],[16,1],[16,1],[16,1],[11,3],[11,3],[11,5],[24,3],[24,3],[24,1],[30,2],[30,3],[30,3],[30,1],[36,1],[36,1],[36,4],[32,1],[32,1],[32,1],[32,1],[32,1],[32,3],[32,3],[32,3],[32,2],[32,7],[32,4],[32,7],[32,2],[32,1],[32,2],[32,1],[34,1],[34,3],[34,2],[34,2],[34,2],[34,1],[56,1],[56,1],[51,9],[53,3],[53,2],[61,3],[61,1],[63,3],[63,1],[64,3],[64,1],[54,1],[54,2],[43,5],[43,4],[66,1],[44,4],[44,2],[44,7],[44,9],[44,3],[44,5],[68,1],[68,1],[68,1],[68,3],[68,5],[45,4],[45,2],[45,5],[45,3],[42,4],[72,3],[72,3],[8,2]],
performAction: function anonymous(yytext,yyleng,yylineno,yy,yystate,$$,_$) {

var $0 = $$.length - 1;
switch (yystate) {
case 1: return $$[$0-1]; 
break;
case 2: return $$[$0-1]; 
break;
case 3: return $$[$0-1]; 
break;
case 4: return $$[$0-1]; 
break;
case 5: return $$[$0-1]; 
break;
case 6: return $$[$0-1]; 
break;
case 7: return $$[$0-1]; 
break;
case 8: return yy.ErrorNode("What do you want variable \'" + $$[$0-2].identifier + "\' to equal?");
break;
case 9: var val = yy.parseFunctionDeclaration($$[$0-1]);
          return yy.ErrorNode("What do you want function \'" + val.identifier.identifier + "\' to equal?");
        
break;
case 10: return yy.ErrorNode("Points are written like this: (1, 2)"); 
break;
case 11: return yy.ErrorNode("You haven't written anything yet"); 
break;
case 12: this.$ = yy.AssignmentNode($$[$0-2], $$[$0]);
break;
case 13: this.$ = yy.AssignmentNode($$[$0-2], yy.ErrorNode);
break;
case 14: this.$ = yy.EquationNode($$[$0-2], $$[$0]);
break;
case 15:this.$ = yy.DoubleInequalityNode($$[$0-4], $$[$0-3], $$[$0-2], $$[$0-1], $$[$0]);
break;
case 16:this.$ = yy.IdentifierNode(yytext);
        yy.setInput(this.$, this._$);
      
break;
case 17: this.$ = yy.OrderedPairListNode($$[$0]);
break;
case 18: this.$ = [($$[$0])]; 
break;
case 19: $$[$0-2].push($$[$0]); this.$ = $$[$0-2] 
break;
case 20: this.$ = yy.OrderedPairNode($$[$0-3], $$[$0-1]); 
break;
case 21: this.$ = yy.OrderedPairNode($$[$0-3], $$[$0-1]); 
break;
case 22:this.$ = $$[$0]; 
      yy.setInput(this.$, this._$);
    
break;
case 23:this.$ = '<'
break;
case 24:this.$ = '>'
break;
case 25:this.$ = '>='
break;
case 26:this.$ = '<='
break;
case 27:this.$ = yy.ComparatorNode($$[$0-1], $$[$0-2], $$[$0]); 
break;
case 28:this.$ = yy.ComparatorNode('===', $$[$0-2], $$[$0]); 
break;
case 29:this.$ = yy.ChainedComparatorNode([$$[$0-3], $$[$0-1]], [$$[$0-4], $$[$0-2], $$[$0]]); 
break;
case 30:this.$ = yy.BinaryOperatorNode('+', $$[$0-2], $$[$0]);
break;
case 31:this.$ = yy.BinaryOperatorNode('-', $$[$0-2], $$[$0]);
break;
case 32:this.$ = $$[$0]
break;
case 33:this.$ = yy.BinaryOperatorNode('*', $$[$0-1], $$[$0]);
break;
case 34:this.$ = yy.BinaryOperatorNode('*', $$[$0-2], $$[$0]);
break;
case 35:this.$ = yy.BinaryOperatorNode('/', $$[$0-2], $$[$0]);
break;
case 36:this.$ = $$[$0];
break;
case 37:this.$ = yy.ConstantNode(Number($$[$0]));
break;
case 38:this.$ = yy.IdentifierNode($$[$0]);
break;
case 39:this.$ = $$[$0-1];
break;
case 40:this.$ = $$[$0];
break;
case 41:this.$ = $$[$0];
break;
case 42:this.$ = $$[$0];
break;
case 43:this.$ = $$[$0];
break;
case 44:this.$ = $$[$0];
break;
case 45:this.$ = $$[$0-1];
break;
case 46:this.$ = $$[$0-1];
break;
case 47:this.$ = yy.FunctionNode(yy.IdentifierNode('\\abs'), [$$[$0-1]]);
break;
case 48:this.$ = yy.BinaryOperatorNode('^', $$[$0-1], $$[$0]);
break;
case 49:this.$ = yy.BinaryOperatorNode('/', $$[$0-4], $$[$0-1]);
break;
case 50:this.$ = yy.FunctionNode(yy.IdentifierNode('\\sqrt'), [$$[$0-1]]);
break;
case 51:this.$ = yy.FunctionNode(yy.IdentifierNode('\\nthroot'), [$$[$0-1], $$[$0-4]]);
break;
case 52:this.$ = yy.FunctionNode(yy.IdentifierNode('\\factorial'), [$$[$0-1]])
break;
case 53:this.$ = $$[$0];
break;
case 54:this.$ = yy.DerivativeNode(yy.IdentifierNode($$[$0-1]), $$[$0]);
break;
case 55:this.$ = $$[$0]
break;
case 56:this.$ = $$[$0];
break;
case 57:this.$ = yy.NegationNode(yy.BinaryOperatorNode('^', yy.ConstantNode(Number($$[$0-1])), $$[$0]));
break;
case 58:this.$ = yy.BinaryOperatorNode('^', $$[$0-1], $$[$0]);
break;
case 59:this.$ = yy.FunctionNode(yy.IdentifierNode('\\factorial'), [$$[$0-1]])
break;
case 60:this.$ = yy.NegationNode($$[$0])
break;
case 61:this.$ = $$[$0]
break;
case 62:this.$ = yy.SummationNode;
break;
case 63:this.$ =  yy.ProductNode;
break;
case 64:this.$ = $$[$0-8]($$[$0-5], $$[$0-3], $$[$0-1], $$[$0]);
break;
case 65:this.$ = $$[$0-1];
break;
case 66:this.$ = yy.ConstantNode(1);
break;
case 67:this.$ = $$[$0-2].append_else(yy.PiecewiseNode(yy.ConstantNode(true), $$[$0]));
break;
case 68:this.$ = $$[$0];
break;
case 69:this.$ = $$[$0-2].append_else($$[$0]);
break;
case 70:this.$ = $$[$0];
break;
case 71: this.$ = yy.PiecewiseNode($$[$0-2], $$[$0]); 
break;
case 72: this.$ = yy.PiecewiseNode($$[$0], yy.ConstantNode(1)); 
break;
case 73:this.$ = yy.ConstantNode(Number(yytext));
break;
case 74:this.$ = yy.ConstantNode(-$$[$0])
break;
case 75:this.$ = yy.FunctionCallExponentNode($$[$0-4], $$[$0-2], $$[$0]);
break;
case 76:this.$ = yy.FunctionNode($$[$0-3], [$$[$0-1]]);
break;
case 77:this.$ = yy.IdentifierNode(yytext);
break;
case 78:this.$ = yy.FunctionNode($$[$0-3], [$$[$0-1]]);
break;
case 79:
          if(!$$[$0].okForImplicitFunction()) {throw 'Too complicated.  Use parens'};
          this.$ = yy.FunctionNode($$[$0-1], [$$[$0]]);
        
break;
case 80: 
          if(!$$[$0].okForImplicitFunction()) {throw 'Too complicated.  Use parens'};
          if($$[$0-2].value != 1) {throw 'Only sin^2 and sin^-1 are supported.  Otherwise, use parens'};
          this.$ = yy.FunctionNode(yy.IdentifierNode(yy.inverses[$$[$0-6].identifier]), [$$[$0]]);
        
break;
case 81:
          if($$[$0-4].value != 1) {throw 'Only sin^2 and sin^-1 are supported.  Otherwise, use parens'};
          this.$ = yy.FunctionNode(yy.IdentifierNode(yy.inverses[$$[$0-8].identifier]), [$$[$0-1]]); 
        
break;
case 82:
          if(!$$[$0].okForImplicitFunction()) {throw 'Too complicated.  Use parens'};
          if($$[$0-1] != "2") {throw 'Only sin^2 and sin^-1 are supported.  Otherwise, use parens'};
          this.$ = yy.BinaryOperatorNode('^', yy.FunctionNode($$[$0-2], [$$[$0]]), yy.ConstantNode(2));
        
break;
case 83:
          if($$[$0-3] != "2") {throw 'Only sin^2 and sin^-1 are supported.  Otherwise, use parens'};
          this.$ = yy.BinaryOperatorNode('^', yy.FunctionNode($$[$0-4], [$$[$0-1]]), yy.ConstantNode(2)); 
        
break;
case 84: this.$ = yy.ConstantNode(Math.E) 
break;
case 85: this.$ = yy.ConstantNode(10) 
break;
case 86: this.$ = yy.ConstantNode(Number(yytext)); 
break;
case 87: this.$ = $$[$0]
break;
case 88: this.$ = $$[$0-1]
break;
case 89:this.$ = yy.FunctionNode(yy.IdentifierNode('log'), [$$[$0-1], $$[$0-3]])
break;
case 90:
      if(!$$[$0].okForImplicitFunction()) {throw 'Too complicated.  Use parens'};
      this.$ = yy.FunctionNode(yy.IdentifierNode('log'), [$$[$0], $$[$0-1]])
    
break;
case 91:
      if($$[$0-3] != "2") {throw 'Only log^2 is supported.  Use parens'}
      this.$ = yy.BinaryOperatorNode('^', yy.FunctionNode(yy.IdentifierNode('log'), [$$[$0-1], $$[$0-4]]), yy.ConstantNode(2))
    
break;
case 92:
      if(!$$[$0].okForImplicitFunction()) {throw 'Too complicated.  Use parens'};
      if($$[$0-1] != "2") {throw 'Only log^2 is supported.  Use parens'}
      this.$ = yy.BinaryOperatorNode('^', yy.FunctionNode(yy.IdentifierNode('log'), [$$[$0], $$[$0-2]]), yy.ConstantNode(2))
    
break;
case 93:this.$ = yy.FunctionNode($$[$0-3], $$[$0-1]);
break;
case 94:this.$ = $$[$0-2].concat([$$[$0]]);
break;
case 95:this.$ = [$$[$0-2], $$[$0]];
break;
case 96:var val = yy.parseFunctionDeclaration($$[$0-1]); this.$ = yy.FunctionDeclarationNode(val.identifier, val.args, $$[$0]);
        this.$.setInputString(val.input_string);
      
break;
}
},
table: [{3:1,4:2,5:[1,11],6:3,7:4,8:5,9:6,10:7,11:8,12:9,14:[1,10],17:[1,14],18:13,19:16,20:[1,18],22:[1,19],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{1:[3]},{5:[1,45],13:[1,47],15:[1,46],16:48,25:[1,49],26:[1,50],27:[1,51],28:[1,52]},{5:[1,53]},{5:[1,54]},{5:[1,55]},{5:[1,56]},{5:[1,57]},{5:[1,58]},{5:[2,40],13:[1,59],15:[2,40],17:[2,40],22:[1,60],25:[2,40],26:[2,40],27:[2,40],28:[2,40],29:[2,40],31:[2,40],33:[2,40],35:[2,40],37:[2,40],38:[2,40],39:[2,40],40:[2,40],46:[2,40],48:[2,40],49:[2,40],50:[2,40],52:[2,40],57:[2,40],58:[2,40],60:[2,40],67:[2,40],69:[2,40],70:[2,40],71:[2,40]},{4:62,5:[1,61],12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{1:[2,11]},{5:[2,22],13:[2,22],15:[2,22],17:[2,22],21:[2,22],22:[2,22],23:[2,22],25:[2,22],26:[2,22],27:[2,22],28:[2,22],29:[1,65],31:[1,66],33:[2,22],35:[2,22],37:[2,22],38:[2,22],39:[2,22],40:[2,22],41:[2,22],46:[2,22],47:[2,22],48:[2,22],49:[2,22],50:[2,22],52:[2,22],57:[2,22],58:[2,22],60:[2,22],62:[2,22],65:[2,22],67:[2,22],69:[2,22],70:[2,22],71:[2,22]},{5:[2,17],15:[1,67]},{5:[2,16],13:[2,16],15:[2,16],17:[2,16],21:[2,16],22:[2,16],23:[2,16],25:[2,16],26:[2,16],27:[2,16],28:[2,16],29:[2,16],31:[2,16],33:[2,16],35:[2,16],37:[2,16],38:[2,16],39:[2,16],40:[2,16],41:[2,16],46:[2,16],47:[2,16],48:[2,16],49:[2,16],50:[2,16],52:[2,16],55:[2,16],57:[2,16],58:[2,16],60:[2,16],62:[2,16],65:[2,16],67:[2,16],69:[2,16],70:[2,16],71:[2,16]},{5:[2,32],12:63,13:[2,32],15:[2,32],17:[1,14],21:[2,32],22:[1,64],23:[2,32],25:[2,32],26:[2,32],27:[2,32],28:[2,32],29:[2,32],31:[2,32],32:68,33:[1,69],35:[1,70],37:[2,32],38:[2,32],39:[2,32],40:[1,28],41:[2,32],42:24,43:25,44:26,45:27,46:[1,29],47:[2,32],48:[1,30],49:[1,31],50:[2,32],51:32,52:[1,33],53:34,56:37,57:[1,43],58:[1,44],60:[1,38],62:[2,32],65:[2,32],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{5:[2,18],15:[2,18]},{5:[2,36],13:[2,36],15:[2,36],17:[2,36],21:[2,36],22:[2,36],23:[2,36],25:[2,36],26:[2,36],27:[2,36],28:[2,36],29:[2,36],31:[2,36],33:[2,36],35:[2,36],36:71,37:[1,73],38:[1,74],39:[1,75],40:[2,36],41:[2,36],46:[2,36],47:[2,36],48:[2,36],49:[2,36],50:[1,72],52:[2,36],57:[2,36],58:[2,36],60:[2,36],62:[2,36],65:[2,36],67:[2,36],69:[2,36],70:[2,36],71:[2,36]},{4:76,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{4:77,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{5:[2,56],13:[2,56],15:[2,56],17:[2,56],21:[2,56],22:[2,56],23:[2,56],25:[2,56],26:[2,56],27:[2,56],28:[2,56],29:[2,56],31:[2,56],33:[2,56],35:[2,56],37:[2,56],38:[2,56],39:[2,56],40:[2,56],41:[2,56],46:[2,56],47:[2,56],48:[2,56],49:[2,56],50:[2,56],52:[2,56],57:[2,56],58:[2,56],60:[2,56],62:[2,56],65:[2,56],67:[2,56],69:[2,56],70:[2,56],71:[2,56]},{12:63,17:[1,14],22:[1,64],31:[1,21],32:22,34:79,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,78],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{5:[2,61],13:[2,61],15:[2,61],17:[2,61],21:[2,61],22:[2,61],23:[2,61],25:[2,61],26:[2,61],27:[2,61],28:[2,61],29:[2,61],31:[2,61],33:[2,61],35:[2,61],36:80,37:[1,73],38:[1,74],39:[1,75],40:[2,61],41:[2,61],46:[2,61],47:[2,61],48:[2,61],49:[2,61],50:[1,81],52:[2,61],57:[2,61],58:[2,61],60:[2,61],62:[2,61],65:[2,61],67:[2,61],69:[2,61],70:[2,61],71:[2,61]},{5:[2,73],13:[2,73],15:[2,73],17:[2,73],21:[2,73],22:[2,73],23:[2,73],25:[2,73],26:[2,73],27:[2,73],28:[2,73],29:[2,73],31:[2,73],33:[2,73],35:[2,73],37:[2,73],38:[2,73],39:[2,73],40:[2,73],41:[2,73],46:[2,73],47:[2,73],48:[2,73],49:[2,73],50:[2,73],52:[2,73],57:[2,73],58:[2,73],60:[2,73],62:[2,73],65:[2,73],67:[2,73],69:[2,73],70:[2,73],71:[2,73]},{5:[2,41],13:[2,41],15:[2,41],17:[2,41],21:[2,41],22:[2,41],23:[2,41],25:[2,41],26:[2,41],27:[2,41],28:[2,41],29:[2,41],31:[2,41],33:[2,41],35:[2,41],37:[2,41],38:[2,41],39:[2,41],40:[2,41],41:[2,41],46:[2,41],47:[2,41],48:[2,41],49:[2,41],50:[2,41],52:[2,41],57:[2,41],58:[2,41],60:[2,41],62:[2,41],65:[2,41],67:[2,41],69:[2,41],70:[2,41],71:[2,41]},{5:[2,42],13:[2,42],15:[2,42],17:[2,42],21:[2,42],22:[2,42],23:[2,42],25:[2,42],26:[2,42],27:[2,42],28:[2,42],29:[2,42],31:[2,42],33:[2,42],35:[2,42],37:[2,42],38:[2,42],39:[2,42],40:[2,42],41:[2,42],46:[2,42],47:[2,42],48:[2,42],49:[2,42],50:[2,42],52:[2,42],57:[2,42],58:[2,42],60:[2,42],62:[2,42],65:[2,42],67:[2,42],69:[2,42],70:[2,42],71:[2,42]},{5:[2,43],13:[2,43],15:[2,43],17:[2,43],21:[2,43],22:[2,43],23:[2,43],25:[2,43],26:[2,43],27:[2,43],28:[2,43],29:[2,43],31:[2,43],33:[2,43],35:[2,43],37:[2,43],38:[2,43],39:[2,43],40:[2,43],41:[2,43],46:[2,43],47:[2,43],48:[2,43],49:[2,43],50:[2,43],52:[2,43],57:[2,43],58:[2,43],60:[2,43],62:[2,43],65:[2,43],67:[2,43],69:[2,43],70:[2,43],71:[2,43]},{5:[2,44],13:[2,44],15:[2,44],17:[2,44],21:[2,44],22:[2,44],23:[2,44],25:[2,44],26:[2,44],27:[2,44],28:[2,44],29:[2,44],31:[2,44],33:[2,44],35:[2,44],37:[2,44],38:[2,44],39:[2,44],40:[2,44],41:[2,44],46:[2,44],47:[2,44],48:[2,44],49:[2,44],50:[2,44],52:[2,44],57:[2,44],58:[2,44],60:[2,44],62:[2,44],65:[2,44],67:[2,44],69:[2,44],70:[2,44],71:[2,44]},{4:82,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{4:83,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{40:[1,84]},{20:[1,86],40:[1,85]},{5:[2,53],13:[2,53],15:[2,53],17:[2,53],21:[2,53],22:[2,53],23:[2,53],25:[2,53],26:[2,53],27:[2,53],28:[2,53],29:[2,53],31:[2,53],33:[2,53],35:[2,53],37:[2,53],38:[2,53],39:[2,53],40:[2,53],41:[2,53],46:[2,53],47:[2,53],48:[2,53],49:[2,53],50:[2,53],52:[2,53],57:[2,53],58:[2,53],60:[2,53],62:[2,53],65:[2,53],67:[2,53],69:[2,53],70:[2,53],71:[2,53]},{12:63,17:[1,14],22:[1,64],30:87,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{5:[2,55],13:[2,55],15:[2,55],17:[2,55],21:[2,55],22:[2,55],23:[2,55],25:[2,55],26:[2,55],27:[2,55],28:[2,55],29:[2,55],31:[2,55],33:[2,55],35:[2,55],37:[2,55],38:[2,55],39:[2,55],40:[2,55],41:[2,55],46:[2,55],47:[2,55],48:[2,55],49:[2,55],50:[2,55],52:[2,55],57:[2,55],58:[2,55],60:[2,55],62:[2,55],65:[2,55],67:[2,55],69:[2,55],70:[2,55],71:[2,55]},{12:63,17:[1,14],22:[1,88],30:89,31:[1,21],32:22,34:17,37:[1,91],39:[1,90],40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{12:63,17:[1,14],22:[1,92],30:93,31:[1,21],32:22,34:17,37:[1,94],40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{59:[1,95]},{4:101,11:100,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],61:96,62:[1,97],63:98,64:99,66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{17:[2,77],22:[2,77],31:[2,77],37:[2,77],39:[2,77],40:[2,77],46:[2,77],48:[2,77],49:[2,77],52:[2,77],55:[2,77],57:[2,77],58:[2,77],60:[2,77],67:[2,77],69:[2,77],70:[2,77],71:[2,77]},{17:[2,84],22:[2,84],31:[2,84],37:[2,84],40:[2,84],46:[2,84],48:[2,84],49:[2,84],52:[2,84],55:[2,84],57:[2,84],58:[2,84],60:[2,84],67:[2,84],69:[2,84],70:[2,84],71:[2,84]},{17:[2,85],22:[2,85],31:[2,85],37:[2,85],40:[2,85],46:[2,85],48:[2,85],49:[2,85],52:[2,85],55:[2,85],57:[2,85],58:[2,85],59:[1,102],60:[2,85],67:[2,85],69:[2,85],70:[2,85],71:[2,85]},{17:[2,86],22:[2,86],31:[2,86],37:[2,86],40:[2,86],46:[2,86],48:[2,86],49:[2,86],52:[2,86],55:[2,86],57:[2,86],58:[2,86],60:[2,86],67:[2,86],69:[2,86],70:[2,86],71:[2,86]},{59:[2,62]},{59:[2,63]},{1:[2,1]},{4:103,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{4:104,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{4:106,12:105,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{17:[2,23],22:[2,23],31:[2,23],40:[2,23],46:[2,23],48:[2,23],49:[2,23],52:[2,23],55:[2,23],57:[2,23],58:[2,23],60:[2,23],67:[2,23],69:[2,23],70:[2,23],71:[2,23]},{17:[2,24],22:[2,24],31:[2,24],40:[2,24],46:[2,24],48:[2,24],49:[2,24],52:[2,24],55:[2,24],57:[2,24],58:[2,24],60:[2,24],67:[2,24],69:[2,24],70:[2,24],71:[2,24]},{17:[2,25],22:[2,25],31:[2,25],40:[2,25],46:[2,25],48:[2,25],49:[2,25],52:[2,25],55:[2,25],57:[2,25],58:[2,25],60:[2,25],67:[2,25],69:[2,25],70:[2,25],71:[2,25]},{17:[2,26],22:[2,26],31:[2,26],40:[2,26],46:[2,26],48:[2,26],49:[2,26],52:[2,26],55:[2,26],57:[2,26],58:[2,26],60:[2,26],67:[2,26],69:[2,26],70:[2,26],71:[2,26]},{1:[2,2]},{1:[2,3]},{1:[2,4]},{1:[2,5]},{1:[2,6]},{1:[2,7]},{2:[1,109],4:108,5:[1,107],12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{4:111,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42],72:110},{1:[2,9]},{5:[2,96]},{5:[2,40],13:[2,40],15:[2,40],17:[2,40],21:[2,40],22:[1,60],23:[2,40],25:[2,40],26:[2,40],27:[2,40],28:[2,40],29:[2,40],31:[2,40],33:[2,40],35:[2,40],37:[2,40],38:[2,40],39:[2,40],40:[2,40],41:[2,40],46:[2,40],47:[2,40],48:[2,40],49:[2,40],50:[2,40],52:[2,40],57:[2,40],58:[2,40],60:[2,40],62:[2,40],65:[2,40],67:[2,40],69:[2,40],70:[2,40],71:[2,40]},{4:112,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{12:63,17:[1,14],22:[1,64],30:113,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{12:63,17:[1,14],22:[1,64],30:114,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{19:115,20:[1,18],22:[1,116]},{5:[2,33],13:[2,33],15:[2,33],17:[2,33],21:[2,33],22:[2,33],23:[2,33],25:[2,33],26:[2,33],27:[2,33],28:[2,33],29:[2,33],31:[2,33],33:[2,33],35:[2,33],36:80,37:[1,73],38:[1,74],39:[1,75],40:[2,33],41:[2,33],46:[2,33],47:[2,33],48:[2,33],49:[2,33],50:[1,81],52:[2,33],57:[2,33],58:[2,33],60:[2,33],62:[2,33],65:[2,33],67:[2,33],69:[2,33],70:[2,33],71:[2,33]},{12:63,17:[1,14],22:[1,64],31:[1,21],32:22,34:117,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{12:63,17:[1,14],22:[1,64],31:[1,21],32:22,34:118,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{5:[2,58],13:[2,58],15:[2,58],17:[2,58],21:[2,58],22:[2,58],23:[2,58],25:[2,58],26:[2,58],27:[2,58],28:[2,58],29:[2,58],31:[2,58],33:[2,58],35:[2,58],37:[2,58],38:[2,58],39:[2,58],40:[2,58],41:[2,58],46:[2,58],47:[2,58],48:[2,58],49:[2,58],50:[2,58],52:[2,58],57:[2,58],58:[2,58],60:[2,58],62:[2,58],65:[2,58],67:[2,58],69:[2,58],70:[2,58],71:[2,58]},{5:[2,59],13:[2,59],15:[2,59],17:[2,59],21:[2,59],22:[2,59],23:[2,59],25:[2,59],26:[2,59],27:[2,59],28:[2,59],29:[2,59],31:[2,59],33:[2,59],35:[2,59],37:[2,59],38:[2,59],39:[2,59],40:[2,59],41:[2,59],46:[2,59],47:[2,59],48:[2,59],49:[2,59],50:[2,59],52:[2,59],57:[2,59],58:[2,59],60:[2,59],62:[2,59],65:[2,59],67:[2,59],69:[2,59],70:[2,59],71:[2,59]},{5:[2,37],13:[2,37],15:[2,37],17:[2,37],21:[2,37],22:[2,37],23:[2,37],25:[2,37],26:[2,37],27:[2,37],28:[2,37],29:[2,37],31:[2,37],33:[2,37],35:[2,37],37:[2,37],38:[2,37],39:[2,37],40:[2,37],41:[2,37],46:[2,37],47:[2,37],48:[2,37],49:[2,37],50:[2,37],52:[2,37],55:[2,37],57:[2,37],58:[2,37],60:[2,37],62:[2,37],65:[2,37],67:[2,37],69:[2,37],70:[2,37],71:[2,37]},{5:[2,38],13:[2,38],15:[2,38],17:[2,38],21:[2,38],22:[2,38],23:[2,38],25:[2,38],26:[2,38],27:[2,38],28:[2,38],29:[2,38],31:[2,38],33:[2,38],35:[2,38],37:[2,38],38:[2,38],39:[2,38],40:[2,38],41:[2,38],46:[2,38],47:[2,38],48:[2,38],49:[2,38],50:[2,38],52:[2,38],55:[2,38],57:[2,38],58:[2,38],60:[2,38],62:[2,38],65:[2,38],67:[2,38],69:[2,38],70:[2,38],71:[2,38]},{40:[1,119]},{15:[1,120]},{15:[1,121],23:[1,122]},{5:[2,74],13:[2,74],15:[2,74],17:[2,74],21:[2,74],22:[2,74],23:[2,74],25:[2,74],26:[2,74],27:[2,74],28:[2,74],29:[2,74],31:[2,74],33:[2,74],35:[2,74],36:123,37:[1,73],38:[1,74],39:[1,75],40:[2,74],41:[2,74],46:[2,74],47:[2,74],48:[2,74],49:[2,74],50:[2,74],52:[2,74],57:[2,74],58:[2,74],60:[2,74],62:[2,74],65:[2,74],67:[2,74],69:[2,74],70:[2,74],71:[2,74]},{5:[2,60],13:[2,60],15:[2,60],17:[2,60],21:[2,60],22:[2,60],23:[2,60],25:[2,60],26:[2,60],27:[2,60],28:[2,60],29:[2,60],31:[2,60],33:[2,60],35:[2,60],36:71,37:[1,73],38:[1,74],39:[1,75],40:[2,60],41:[2,60],46:[2,60],47:[2,60],48:[2,60],49:[2,60],50:[1,72],52:[2,60],57:[2,60],58:[2,60],60:[2,60],62:[2,60],65:[2,60],67:[2,60],69:[2,60],70:[2,60],71:[2,60]},{5:[2,48],13:[2,48],15:[2,48],17:[2,48],21:[2,48],22:[2,48],23:[2,48],25:[2,48],26:[2,48],27:[2,48],28:[2,48],29:[2,48],31:[2,48],33:[2,48],35:[2,48],37:[2,48],38:[2,48],39:[2,48],40:[2,48],41:[2,48],46:[2,48],47:[2,48],48:[2,48],49:[2,48],50:[2,48],52:[2,48],57:[2,48],58:[2,48],60:[2,48],62:[2,48],65:[2,48],67:[2,48],69:[2,48],70:[2,48],71:[2,48]},{5:[2,52],13:[2,52],15:[2,52],17:[2,52],21:[2,52],22:[2,52],23:[2,52],25:[2,52],26:[2,52],27:[2,52],28:[2,52],29:[2,52],31:[2,52],33:[2,52],35:[2,52],37:[2,52],38:[2,52],39:[2,52],40:[2,52],41:[2,52],46:[2,52],47:[2,52],48:[2,52],49:[2,52],50:[2,52],52:[2,52],57:[2,52],58:[2,52],60:[2,52],62:[2,52],65:[2,52],67:[2,52],69:[2,52],70:[2,52],71:[2,52]},{41:[1,124]},{47:[1,125]},{4:126,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{4:127,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{4:128,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{5:[2,54],12:63,13:[2,54],15:[2,54],17:[1,14],21:[2,54],22:[1,64],23:[2,54],25:[2,54],26:[2,54],27:[2,54],28:[2,54],29:[2,54],31:[2,54],32:68,33:[1,69],35:[1,70],37:[2,54],38:[2,54],39:[2,54],40:[1,28],41:[2,54],42:24,43:25,44:26,45:27,46:[1,29],47:[2,54],48:[1,30],49:[1,31],50:[2,54],51:32,52:[1,33],53:34,56:37,57:[1,43],58:[1,44],60:[1,38],62:[2,54],65:[2,54],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{4:129,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{5:[2,79],12:63,13:[2,79],15:[2,79],17:[1,14],21:[2,79],22:[1,64],23:[2,79],25:[2,79],26:[2,79],27:[2,79],28:[2,79],29:[2,79],31:[2,79],32:68,33:[1,69],35:[1,70],37:[2,79],38:[2,79],39:[2,79],40:[1,28],41:[2,79],42:24,43:25,44:26,45:27,46:[1,29],47:[2,79],48:[1,30],49:[1,31],50:[2,79],51:32,52:[1,33],53:34,56:37,57:[1,43],58:[1,44],60:[1,38],62:[2,79],65:[2,79],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{40:[1,130]},{12:63,17:[1,14],22:[1,132],30:131,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{4:133,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{5:[2,90],12:63,13:[2,90],15:[2,90],17:[1,14],21:[2,90],22:[1,64],23:[2,90],25:[2,90],26:[2,90],27:[2,90],28:[2,90],29:[2,90],31:[2,90],32:68,33:[1,69],35:[1,70],37:[2,90],38:[2,90],39:[2,90],40:[1,28],41:[2,90],42:24,43:25,44:26,45:27,46:[1,29],47:[2,90],48:[1,30],49:[1,31],50:[2,90],51:32,52:[1,33],53:34,56:37,57:[1,43],58:[1,44],60:[1,38],62:[2,90],65:[2,90],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{12:63,17:[1,14],22:[1,134],30:135,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{40:[1,136]},{62:[1,137]},{5:[2,66],13:[2,66],15:[2,66],17:[2,66],21:[2,66],22:[2,66],23:[2,66],25:[2,66],26:[2,66],27:[2,66],28:[2,66],29:[2,66],31:[2,66],33:[2,66],35:[2,66],37:[2,66],38:[2,66],39:[2,66],40:[2,66],41:[2,66],46:[2,66],47:[2,66],48:[2,66],49:[2,66],50:[2,66],52:[2,66],57:[2,66],58:[2,66],60:[2,66],62:[2,66],65:[2,66],67:[2,66],69:[2,66],70:[2,66],71:[2,66]},{15:[1,138],62:[2,68]},{15:[2,70],62:[2,70]},{15:[2,72],62:[2,72],65:[1,139]},{13:[1,141],16:140,25:[1,49],26:[1,50],27:[1,51],28:[1,52]},{12:142,17:[1,14],40:[1,143]},{5:[1,144]},{5:[2,14]},{5:[2,40],16:145,17:[2,40],22:[1,60],25:[1,49],26:[1,50],27:[1,51],28:[1,52],29:[2,40],31:[2,40],33:[2,40],35:[2,40],37:[2,40],38:[2,40],39:[2,40],40:[2,40],46:[2,40],48:[2,40],49:[2,40],50:[2,40],52:[2,40],57:[2,40],58:[2,40],60:[2,40],67:[2,40],69:[2,40],70:[2,40],71:[2,40]},{5:[2,27],15:[2,27],16:146,25:[1,49],26:[1,50],27:[1,51],28:[1,52],62:[2,27],65:[2,27]},{1:[2,8]},{5:[2,12]},{5:[2,13]},{15:[1,148],23:[1,147]},{15:[1,150],23:[1,149]},{23:[1,122]},{5:[2,30],12:63,13:[2,30],15:[2,30],17:[1,14],21:[2,30],22:[1,64],23:[2,30],25:[2,30],26:[2,30],27:[2,30],28:[2,30],29:[2,30],31:[2,30],32:68,33:[1,69],35:[1,70],37:[2,30],38:[2,30],39:[2,30],40:[1,28],41:[2,30],42:24,43:25,44:26,45:27,46:[1,29],47:[2,30],48:[1,30],49:[1,31],50:[2,30],51:32,52:[1,33],53:34,56:37,57:[1,43],58:[1,44],60:[1,38],62:[2,30],65:[2,30],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{5:[2,31],12:63,13:[2,31],15:[2,31],17:[1,14],21:[2,31],22:[1,64],23:[2,31],25:[2,31],26:[2,31],27:[2,31],28:[2,31],29:[2,31],31:[2,31],32:68,33:[1,69],35:[1,70],37:[2,31],38:[2,31],39:[2,31],40:[1,28],41:[2,31],42:24,43:25,44:26,45:27,46:[1,29],47:[2,31],48:[1,30],49:[1,31],50:[2,31],51:32,52:[1,33],53:34,56:37,57:[1,43],58:[1,44],60:[1,38],62:[2,31],65:[2,31],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{5:[2,19],15:[2,19]},{4:151,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{5:[2,34],13:[2,34],15:[2,34],17:[2,34],21:[2,34],22:[2,34],23:[2,34],25:[2,34],26:[2,34],27:[2,34],28:[2,34],29:[2,34],31:[2,34],33:[2,34],35:[2,34],36:71,37:[1,73],38:[1,74],39:[1,75],40:[2,34],41:[2,34],46:[2,34],47:[2,34],48:[2,34],49:[2,34],50:[1,72],52:[2,34],57:[2,34],58:[2,34],60:[2,34],62:[2,34],65:[2,34],67:[2,34],69:[2,34],70:[2,34],71:[2,34]},{5:[2,35],13:[2,35],15:[2,35],17:[2,35],21:[2,35],22:[2,35],23:[2,35],25:[2,35],26:[2,35],27:[2,35],28:[2,35],29:[2,35],31:[2,35],33:[2,35],35:[2,35],36:71,37:[1,73],38:[1,74],39:[1,75],40:[2,35],41:[2,35],46:[2,35],47:[2,35],48:[2,35],49:[2,35],50:[1,72],52:[2,35],57:[2,35],58:[2,35],60:[2,35],62:[2,35],65:[2,35],67:[2,35],69:[2,35],70:[2,35],71:[2,35]},{4:152,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{4:153,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{4:154,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{5:[2,45],13:[2,45],15:[2,45],17:[2,45],21:[2,45],22:[2,45],23:[2,45],25:[2,45],26:[2,45],27:[2,45],28:[2,45],29:[2,45],31:[2,45],33:[2,45],35:[2,45],37:[2,45],38:[2,45],39:[2,45],40:[2,45],41:[2,45],46:[2,45],47:[2,45],48:[2,45],49:[2,45],50:[2,45],52:[2,45],57:[2,45],58:[2,45],60:[2,45],62:[2,45],65:[2,45],67:[2,45],69:[2,45],70:[2,45],71:[2,45]},{5:[2,57],13:[2,57],15:[2,57],17:[2,57],21:[2,57],22:[2,57],23:[2,57],25:[2,57],26:[2,57],27:[2,57],28:[2,57],29:[2,57],31:[2,57],33:[2,57],35:[2,57],37:[2,57],38:[2,57],39:[2,57],40:[2,57],41:[2,57],46:[2,57],47:[2,57],48:[2,57],49:[2,57],50:[2,57],52:[2,57],57:[2,57],58:[2,57],60:[2,57],62:[2,57],65:[2,57],67:[2,57],69:[2,57],70:[2,57],71:[2,57]},{5:[2,46],13:[2,46],15:[2,46],17:[2,46],21:[2,46],22:[2,46],23:[2,46],25:[2,46],26:[2,46],27:[2,46],28:[2,46],29:[2,46],31:[2,46],33:[2,46],35:[2,46],37:[2,46],38:[2,46],39:[2,46],40:[2,46],41:[2,46],46:[2,46],47:[2,46],48:[2,46],49:[2,46],50:[2,46],52:[2,46],57:[2,46],58:[2,46],60:[2,46],62:[2,46],65:[2,46],67:[2,46],69:[2,46],70:[2,46],71:[2,46]},{5:[2,47],13:[2,47],15:[2,47],17:[2,47],21:[2,47],22:[2,47],23:[2,47],25:[2,47],26:[2,47],27:[2,47],28:[2,47],29:[2,47],31:[2,47],33:[2,47],35:[2,47],37:[2,47],38:[2,47],39:[2,47],40:[2,47],41:[2,47],46:[2,47],47:[2,47],48:[2,47],49:[2,47],50:[2,47],52:[2,47],57:[2,47],58:[2,47],60:[2,47],62:[2,47],65:[2,47],67:[2,47],69:[2,47],70:[2,47],71:[2,47]},{41:[1,155]},{41:[1,156]},{21:[1,157]},{23:[1,158]},{31:[1,159]},{5:[2,82],12:63,13:[2,82],15:[2,82],17:[1,14],21:[2,82],22:[1,64],23:[2,82],25:[2,82],26:[2,82],27:[2,82],28:[2,82],29:[2,82],31:[2,82],32:68,33:[1,69],35:[1,70],37:[2,82],38:[2,82],39:[2,82],40:[1,28],41:[2,82],42:24,43:25,44:26,45:27,46:[1,29],47:[2,82],48:[1,30],49:[1,31],50:[2,82],51:32,52:[1,33],53:34,56:37,57:[1,43],58:[1,44],60:[1,38],62:[2,82],65:[2,82],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{4:160,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{23:[1,161]},{4:162,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{5:[2,92],12:63,13:[2,92],15:[2,92],17:[1,14],21:[2,92],22:[1,64],23:[2,92],25:[2,92],26:[2,92],27:[2,92],28:[2,92],29:[2,92],31:[2,92],32:68,33:[1,69],35:[1,70],37:[2,92],38:[2,92],39:[2,92],40:[1,28],41:[2,92],42:24,43:25,44:26,45:27,46:[1,29],47:[2,92],48:[1,30],49:[1,31],50:[2,92],51:32,52:[1,33],53:34,56:37,57:[1,43],58:[1,44],60:[1,38],62:[2,92],65:[2,92],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{12:163,17:[1,14]},{5:[2,65],13:[2,65],15:[2,65],17:[2,65],21:[2,65],22:[2,65],23:[2,65],25:[2,65],26:[2,65],27:[2,65],28:[2,65],29:[2,65],31:[2,65],33:[2,65],35:[2,65],37:[2,65],38:[2,65],39:[2,65],40:[2,65],41:[2,65],46:[2,65],47:[2,65],48:[2,65],49:[2,65],50:[2,65],52:[2,65],57:[2,65],58:[2,65],60:[2,65],62:[2,65],65:[2,65],67:[2,65],69:[2,65],70:[2,65],71:[2,65]},{4:164,11:100,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],64:165,66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{4:166,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{4:106,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{4:167,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{17:[2,87],22:[2,87],31:[2,87],37:[2,87],40:[2,87],46:[2,87],48:[2,87],49:[2,87],52:[2,87],55:[2,87],57:[2,87],58:[2,87],60:[2,87],67:[2,87],69:[2,87],70:[2,87],71:[2,87]},{4:168,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{1:[2,10]},{4:169,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{4:170,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{5:[2,93],13:[2,93],15:[2,93],17:[2,93],21:[2,93],22:[2,93],23:[2,93],25:[2,93],26:[2,93],27:[2,93],28:[2,93],29:[2,93],31:[2,93],33:[2,93],35:[2,93],37:[2,93],38:[2,93],39:[2,93],40:[2,93],41:[2,93],46:[2,93],47:[2,93],48:[2,93],49:[2,93],50:[2,93],52:[2,93],57:[2,93],58:[2,93],60:[2,93],62:[2,93],65:[2,93],67:[2,93],69:[2,93],70:[2,93],71:[2,93]},{4:171,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{5:[2,76],13:[2,76],15:[2,76],17:[2,76],21:[2,76],22:[2,76],23:[2,76],25:[2,76],26:[2,76],27:[2,76],28:[2,76],29:[2,76],31:[2,76],33:[2,76],35:[2,76],36:172,37:[1,73],38:[1,74],39:[1,75],40:[2,76],41:[2,76],46:[2,76],47:[2,76],48:[2,76],49:[2,76],50:[2,76],52:[2,76],57:[2,76],58:[2,76],60:[2,76],62:[2,76],65:[2,76],67:[2,76],69:[2,76],70:[2,76],71:[2,76]},{4:173,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{15:[1,121]},{41:[1,174]},{21:[1,175]},{23:[1,176]},{40:[1,177]},{5:[2,50],13:[2,50],15:[2,50],17:[2,50],21:[2,50],22:[2,50],23:[2,50],25:[2,50],26:[2,50],27:[2,50],28:[2,50],29:[2,50],31:[2,50],33:[2,50],35:[2,50],37:[2,50],38:[2,50],39:[2,50],40:[2,50],41:[2,50],46:[2,50],47:[2,50],48:[2,50],49:[2,50],50:[2,50],52:[2,50],57:[2,50],58:[2,50],60:[2,50],62:[2,50],65:[2,50],67:[2,50],69:[2,50],70:[2,50],71:[2,50]},{40:[1,178]},{5:[2,78],13:[2,78],15:[2,78],17:[2,78],21:[2,78],22:[2,78],23:[2,78],25:[2,78],26:[2,78],27:[2,78],28:[2,78],29:[2,78],31:[2,78],33:[2,78],35:[2,78],37:[2,78],38:[2,78],39:[2,78],40:[2,78],41:[2,78],46:[2,78],47:[2,78],48:[2,78],49:[2,78],50:[2,78],52:[2,78],57:[2,78],58:[2,78],60:[2,78],62:[2,78],65:[2,78],67:[2,78],69:[2,78],70:[2,78],71:[2,78]},{31:[1,180],54:179,55:[1,23]},{23:[1,181]},{5:[2,89],13:[2,89],15:[2,89],17:[2,89],21:[2,89],22:[2,89],23:[2,89],25:[2,89],26:[2,89],27:[2,89],28:[2,89],29:[2,89],31:[2,89],33:[2,89],35:[2,89],37:[2,89],38:[2,89],39:[2,89],40:[2,89],41:[2,89],46:[2,89],47:[2,89],48:[2,89],49:[2,89],50:[2,89],52:[2,89],57:[2,89],58:[2,89],60:[2,89],62:[2,89],65:[2,89],67:[2,89],69:[2,89],70:[2,89],71:[2,89]},{23:[1,182]},{13:[1,183]},{13:[1,141],16:140,25:[1,49],26:[1,50],27:[1,51],28:[1,52],62:[2,67]},{15:[2,69],62:[2,69]},{15:[2,71],62:[2,71]},{15:[2,28],62:[2,28],65:[2,28]},{41:[1,184]},{5:[2,15]},{5:[2,29],15:[2,29],62:[2,29],65:[2,29]},{15:[2,94],23:[2,94]},{5:[2,75],13:[2,75],15:[2,75],17:[2,75],21:[2,75],22:[2,75],23:[2,75],25:[2,75],26:[2,75],27:[2,75],28:[2,75],29:[2,75],31:[2,75],33:[2,75],35:[2,75],37:[2,75],38:[2,75],39:[2,75],40:[2,75],41:[2,75],46:[2,75],47:[2,75],48:[2,75],49:[2,75],50:[2,75],52:[2,75],57:[2,75],58:[2,75],60:[2,75],62:[2,75],65:[2,75],67:[2,75],69:[2,75],70:[2,75],71:[2,75]},{15:[2,95],23:[2,95]},{5:[2,39],13:[2,39],15:[2,39],17:[2,39],21:[2,39],22:[2,39],23:[2,39],25:[2,39],26:[2,39],27:[2,39],28:[2,39],29:[2,39],31:[2,39],33:[2,39],35:[2,39],37:[2,39],38:[2,39],39:[2,39],40:[2,39],41:[2,39],46:[2,39],47:[2,39],48:[2,39],49:[2,39],50:[2,39],52:[2,39],55:[2,39],57:[2,39],58:[2,39],60:[2,39],62:[2,39],65:[2,39],67:[2,39],69:[2,39],70:[2,39],71:[2,39]},{5:[2,20],15:[2,20]},{5:[2,21],15:[2,21]},{4:185,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{4:186,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{41:[1,187]},{55:[1,188]},{5:[2,83],13:[2,83],15:[2,83],17:[2,83],21:[2,83],22:[2,83],23:[2,83],25:[2,83],26:[2,83],27:[2,83],28:[2,83],29:[2,83],31:[2,83],33:[2,83],35:[2,83],37:[2,83],38:[2,83],39:[2,83],40:[2,83],41:[2,83],46:[2,83],47:[2,83],48:[2,83],49:[2,83],50:[2,83],52:[2,83],57:[2,83],58:[2,83],60:[2,83],62:[2,83],65:[2,83],67:[2,83],69:[2,83],70:[2,83],71:[2,83]},{5:[2,91],13:[2,91],15:[2,91],17:[2,91],21:[2,91],22:[2,91],23:[2,91],25:[2,91],26:[2,91],27:[2,91],28:[2,91],29:[2,91],31:[2,91],33:[2,91],35:[2,91],37:[2,91],38:[2,91],39:[2,91],40:[2,91],41:[2,91],46:[2,91],47:[2,91],48:[2,91],49:[2,91],50:[2,91],52:[2,91],57:[2,91],58:[2,91],60:[2,91],62:[2,91],65:[2,91],67:[2,91],69:[2,91],70:[2,91],71:[2,91]},{4:189,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{17:[2,88],22:[2,88],31:[2,88],37:[2,88],40:[2,88],46:[2,88],48:[2,88],49:[2,88],52:[2,88],55:[2,88],57:[2,88],58:[2,88],60:[2,88],67:[2,88],69:[2,88],70:[2,88],71:[2,88]},{41:[1,190]},{41:[1,191]},{12:63,17:[1,14],22:[1,193],30:192,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{41:[2,74]},{41:[1,194]},{5:[2,49],13:[2,49],15:[2,49],17:[2,49],21:[2,49],22:[2,49],23:[2,49],25:[2,49],26:[2,49],27:[2,49],28:[2,49],29:[2,49],31:[2,49],33:[2,49],35:[2,49],37:[2,49],38:[2,49],39:[2,49],40:[2,49],41:[2,49],46:[2,49],47:[2,49],48:[2,49],49:[2,49],50:[2,49],52:[2,49],57:[2,49],58:[2,49],60:[2,49],62:[2,49],65:[2,49],67:[2,49],69:[2,49],70:[2,49],71:[2,49]},{5:[2,51],13:[2,51],15:[2,51],17:[2,51],21:[2,51],22:[2,51],23:[2,51],25:[2,51],26:[2,51],27:[2,51],28:[2,51],29:[2,51],31:[2,51],33:[2,51],35:[2,51],37:[2,51],38:[2,51],39:[2,51],40:[2,51],41:[2,51],46:[2,51],47:[2,51],48:[2,51],49:[2,51],50:[2,51],52:[2,51],57:[2,51],58:[2,51],60:[2,51],62:[2,51],65:[2,51],67:[2,51],69:[2,51],70:[2,51],71:[2,51]},{5:[2,80],12:63,13:[2,80],15:[2,80],17:[1,14],21:[2,80],22:[1,64],23:[2,80],25:[2,80],26:[2,80],27:[2,80],28:[2,80],29:[2,80],31:[2,80],32:68,33:[1,69],35:[1,70],37:[2,80],38:[2,80],39:[2,80],40:[1,28],41:[2,80],42:24,43:25,44:26,45:27,46:[1,29],47:[2,80],48:[1,30],49:[1,31],50:[2,80],51:32,52:[1,33],53:34,56:37,57:[1,43],58:[1,44],60:[1,38],62:[2,80],65:[2,80],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{4:195,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{36:196,37:[1,73],38:[1,74],39:[1,75]},{23:[1,197]},{4:198,12:63,17:[1,14],22:[1,64],24:12,30:15,31:[1,21],32:22,34:17,40:[1,28],42:24,43:25,44:26,45:27,46:[1,29],48:[1,30],49:[1,31],51:32,52:[1,33],53:34,54:20,55:[1,23],56:37,57:[1,43],58:[1,44],60:[1,38],66:35,67:[1,39],68:36,69:[1,40],70:[1,41],71:[1,42]},{5:[2,81],13:[2,81],15:[2,81],17:[2,81],21:[2,81],22:[2,81],23:[2,81],25:[2,81],26:[2,81],27:[2,81],28:[2,81],29:[2,81],31:[2,81],33:[2,81],35:[2,81],37:[2,81],38:[2,81],39:[2,81],40:[2,81],41:[2,81],46:[2,81],47:[2,81],48:[2,81],49:[2,81],50:[2,81],52:[2,81],57:[2,81],58:[2,81],60:[2,81],62:[2,81],65:[2,81],67:[2,81],69:[2,81],70:[2,81],71:[2,81]},{5:[2,64],13:[2,64],15:[2,64],17:[2,64],21:[2,64],22:[2,64],23:[2,64],25:[2,64],26:[2,64],27:[2,64],28:[2,64],29:[2,64],31:[2,64],33:[2,64],35:[2,64],37:[2,64],38:[2,64],39:[2,64],40:[2,64],41:[2,64],46:[2,64],47:[2,64],48:[2,64],49:[2,64],50:[2,64],52:[2,64],57:[2,64],58:[2,64],60:[2,64],62:[2,64],65:[2,64],67:[2,64],69:[2,64],70:[2,64],71:[2,64]}],
defaultActions: {11:[2,11],43:[2,62],44:[2,63],45:[2,1],53:[2,2],54:[2,3],55:[2,4],56:[2,5],57:[2,6],58:[2,7],61:[2,9],62:[2,96],104:[2,14],107:[2,8],108:[2,12],109:[2,13],144:[2,10],169:[2,15],188:[2,74]},
parseError: function parseError(str, hash) {
    throw new Error(str);
},
parse: function parse(input) {
    var self = this,
        stack = [0],
        vstack = [null], // semantic value stack
        lstack = [], // location stack
        table = this.table,
        yytext = '',
        yylineno = 0,
        yyleng = 0,
        recovering = 0,
        TERROR = 2,
        EOF = 1;

    //this.reductionCount = this.shiftCount = 0;

    this.lexer.setInput(input);
    this.lexer.yy = this.yy;
    this.yy.lexer = this.lexer;
    this.yy.parser = this;
    if (typeof this.lexer.yylloc == 'undefined')
        this.lexer.yylloc = {};
    var yyloc = this.lexer.yylloc;
    lstack.push(yyloc);

    var ranges = this.lexer.options && this.lexer.options.ranges;

    if (typeof this.yy.parseError === 'function')
        this.parseError = this.yy.parseError;

    function popStack (n) {
        stack.length = stack.length - 2*n;
        vstack.length = vstack.length - n;
        lstack.length = lstack.length - n;
    }

    function lex() {
        var token;
        token = self.lexer.lex() || 1; // $end = 1
        // if token isn't its numeric value, convert
        if (typeof token !== 'number') {
            token = self.symbols_[token] || token;
        }
        return token;
    }

    var symbol, preErrorSymbol, state, action, a, r, yyval={},p,len,newState, expected;
    while (true) {
        // retreive state number from top of stack
        state = stack[stack.length-1];

        // use default actions if available
        if (this.defaultActions[state]) {
            action = this.defaultActions[state];
        } else {
            if (symbol === null || typeof symbol == 'undefined') {
                symbol = lex();
            }
            // read action for current state and first input
            action = table[state] && table[state][symbol];
        }

        // handle parse error
        _handle_error:
        if (typeof action === 'undefined' || !action.length || !action[0]) {

            var errStr = '';
            if (!recovering) {
                // Report error
                expected = [];
                for (p in table[state]) if (this.terminals_[p] && p > 2) {
                    expected.push("'"+this.terminals_[p]+"'");
                }
                if (this.lexer.showPosition) {
                    errStr = 'Parse error on line '+(yylineno+1)+":\n"+this.lexer.showPosition()+"\nExpecting "+expected.join(', ') + ", got '" + (this.terminals_[symbol] || symbol)+ "'";
                } else {
                    errStr = 'Parse error on line '+(yylineno+1)+": Unexpected " +
                                  (symbol == 1 /*EOF*/ ? "end of input" :
                                              ("'"+(this.terminals_[symbol] || symbol)+"'"));
                }
                this.parseError(errStr,
                    {text: this.lexer.match, token: this.terminals_[symbol] || symbol, line: this.lexer.yylineno, loc: yyloc, expected: expected});
            }

            // just recovered from another error
            if (recovering == 3) {
                if (symbol == EOF) {
                    throw new Error(errStr || 'Parsing halted.');
                }

                // discard current lookahead and grab another
                yyleng = this.lexer.yyleng;
                yytext = this.lexer.yytext;
                yylineno = this.lexer.yylineno;
                yyloc = this.lexer.yylloc;
                symbol = lex();
            }

            // try to recover from error
            while (1) {
                // check for error recovery rule in this state
                if ((TERROR.toString()) in table[state]) {
                    break;
                }
                if (state === 0) {
                    throw new Error(errStr || 'Parsing halted.');
                }
                popStack(1);
                state = stack[stack.length-1];
            }

            preErrorSymbol = symbol == 2 ? null : symbol; // save the lookahead token
            symbol = TERROR;         // insert generic error symbol as new lookahead
            state = stack[stack.length-1];
            action = table[state] && table[state][TERROR];
            recovering = 3; // allow 3 real symbols to be shifted before reporting a new error
        }

        // this shouldn't happen, unless resolve defaults are off
        if (action[0] instanceof Array && action.length > 1) {
            throw new Error('Parse Error: multiple actions possible at state: '+state+', token: '+symbol);
        }

        switch (action[0]) {

            case 1: // shift
                //this.shiftCount++;

                stack.push(symbol);
                vstack.push(this.lexer.yytext);
                lstack.push(this.lexer.yylloc);
                stack.push(action[1]); // push state
                symbol = null;
                if (!preErrorSymbol) { // normal execution/no error
                    yyleng = this.lexer.yyleng;
                    yytext = this.lexer.yytext;
                    yylineno = this.lexer.yylineno;
                    yyloc = this.lexer.yylloc;
                    if (recovering > 0)
                        recovering--;
                } else { // error just occurred, resume old lookahead f/ before error
                    symbol = preErrorSymbol;
                    preErrorSymbol = null;
                }
                break;

            case 2: // reduce
                //this.reductionCount++;

                len = this.productions_[action[1]][1];

                // perform semantic action
                yyval.$ = vstack[vstack.length-len]; // default to $$ = $1
                // default location, uses first token for firsts, last for lasts
                yyval._$ = {
                    first_line: lstack[lstack.length-(len||1)].first_line,
                    last_line: lstack[lstack.length-1].last_line,
                    first_column: lstack[lstack.length-(len||1)].first_column,
                    last_column: lstack[lstack.length-1].last_column
                };
                if (ranges) {
                  yyval._$.range = [lstack[lstack.length-(len||1)].range[0], lstack[lstack.length-1].range[1]];
                }
                r = this.performAction.call(yyval, yytext, yyleng, yylineno, this.yy, action[1], vstack, lstack);

                if (typeof r !== 'undefined') {
                    return r;
                }

                // pop off stack
                if (len) {
                    stack = stack.slice(0,-1*len*2);
                    vstack = vstack.slice(0, -1*len);
                    lstack = lstack.slice(0, -1*len);
                }

                stack.push(this.productions_[action[1]][0]);    // push nonterminal (reduce)
                vstack.push(yyval.$);
                lstack.push(yyval._$);
                // goto new state = table[STATE][NONTERMINAL]
                newState = table[stack[stack.length-2]][stack[stack.length-1]];
                stack.push(newState);
                break;

            case 3: // accept
                return true;
        }

    }

    return true;
}};
/* Jison generated lexer */
var lexer = (function(){
var lexer = ({EOF:1,
parseError:function parseError(str, hash) {
        if (this.yy.parser) {
            this.yy.parser.parseError(str, hash);
        } else {
            throw new Error(str);
        }
    },
setInput:function (input) {
        this._input = input;
        this._more = this._less = this.done = false;
        this.yylineno = this.yyleng = 0;
        this.yytext = this.matched = this.match = '';
        this.conditionStack = ['INITIAL'];
        this.yylloc = {first_line:1,first_column:0,last_line:1,last_column:0};
        if (this.options.ranges) this.yylloc.range = [0,0];
        this.offset = 0;
        return this;
    },
input:function () {
        var ch = this._input[0];
        this.yytext += ch;
        this.yyleng++;
        this.offset++;
        this.match += ch;
        this.matched += ch;
        var lines = ch.match(/(?:\r\n?|\n).*/g);
        if (lines) {
            this.yylineno++;
            this.yylloc.last_line++;
        } else {
            this.yylloc.last_column++;
        }
        if (this.options.ranges) this.yylloc.range[1]++;

        this._input = this._input.slice(1);
        return ch;
    },
unput:function (ch) {
        var len = ch.length;
        var lines = ch.split(/(?:\r\n?|\n)/g);

        this._input = ch + this._input;
        this.yytext = this.yytext.substr(0, this.yytext.length-len-1);
        //this.yyleng -= len;
        this.offset -= len;
        var oldLines = this.match.split(/(?:\r\n?|\n)/g);
        this.match = this.match.substr(0, this.match.length-1);
        this.matched = this.matched.substr(0, this.matched.length-1);

        if (lines.length-1) this.yylineno -= lines.length-1;
        var r = this.yylloc.range;

        this.yylloc = {first_line: this.yylloc.first_line,
          last_line: this.yylineno+1,
          first_column: this.yylloc.first_column,
          last_column: lines ?
              (lines.length === oldLines.length ? this.yylloc.first_column : 0) + oldLines[oldLines.length - lines.length].length - lines[0].length:
              this.yylloc.first_column - len
          };

        if (this.options.ranges) {
            this.yylloc.range = [r[0], r[0] + this.yyleng - len];
        }
        return this;
    },
more:function () {
        this._more = true;
        return this;
    },
less:function (n) {
        this.unput(this.match.slice(n));
    },
pastInput:function () {
        var past = this.matched.substr(0, this.matched.length - this.match.length);
        return (past.length > 20 ? '...':'') + past.substr(-20).replace(/\n/g, "");
    },
upcomingInput:function () {
        var next = this.match;
        if (next.length < 20) {
            next += this._input.substr(0, 20-next.length);
        }
        return (next.substr(0,20)+(next.length > 20 ? '...':'')).replace(/\n/g, "");
    },
showPosition:function () {
        var pre = this.pastInput();
        var c = new Array(pre.length + 1).join("-");
        return pre + this.upcomingInput() + "\n" + c+"^";
    },
next:function () {
        if (this.done) {
            return this.EOF;
        }
        if (!this._input) this.done = true;

        var token,
            match,
            tempMatch,
            index,
            col,
            lines;
        if (!this._more) {
            this.yytext = '';
            this.match = '';
        }
        var rules = this._currentRules();
        for (var i=0;i < rules.length; i++) {
            tempMatch = this._input.match(this.rules[rules[i]]);
            if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
                match = tempMatch;
                index = i;
                if (!this.options.flex) break;
            }
        }
        if (match) {
            lines = match[0].match(/(?:\r\n?|\n).*/g);
            if (lines) this.yylineno += lines.length;
            this.yylloc = {first_line: this.yylloc.last_line,
                           last_line: this.yylineno+1,
                           first_column: this.yylloc.last_column,
                           last_column: lines ? lines[lines.length-1].length-lines[lines.length-1].match(/\r?\n?/)[0].length : this.yylloc.last_column + match[0].length};
            this.yytext += match[0];
            this.match += match[0];
            this.matches = match;
            this.yyleng = this.yytext.length;
            if (this.options.ranges) {
                this.yylloc.range = [this.offset, this.offset += this.yyleng];
            }
            this._more = false;
            this._input = this._input.slice(match[0].length);
            this.matched += match[0];
            token = this.performAction.call(this, this.yy, this, rules[index],this.conditionStack[this.conditionStack.length-1]);
            if (this.done && this._input) this.done = false;
            if (token) return token;
            else return;
        }
        if (this._input === "") {
            return this.EOF;
        } else {
            return this.parseError('Lexical error on line '+(this.yylineno+1)+'. Unrecognized text.\n'+this.showPosition(),
                    {text: "", token: null, line: this.yylineno});
        }
    },
lex:function lex() {
        var r = this.next();
        if (typeof r !== 'undefined') {
            return r;
        } else {
            return this.lex();
        }
    },
begin:function begin(condition) {
        this.conditionStack.push(condition);
    },
popState:function popState() {
        return this.conditionStack.pop();
    },
_currentRules:function _currentRules() {
        return this.conditions[this.conditionStack[this.conditionStack.length-1]].rules;
    },
topState:function () {
        return this.conditionStack[this.conditionStack.length-2];
    },
pushState:function begin(condition) {
        this.begin(condition);
    }});
lexer.options = {};
lexer.performAction = function anonymous(yy,yy_,$avoiding_name_collisions,YY_START) {

var YYSTATE=YY_START
switch($avoiding_name_collisions) {
case 0:/* skip whitespace */
break;
case 1:return 40
break;
case 2:return 41
break;
case 3:return 'MATH_SHIFT'
break;
case 4:yy_.yytext = this.matches[this.matches.length - 1]; return 37
break;
case 5:yy_.yytext = this.matches[this.matches.length - 1]; return 38
break;
case 6:return 39
break;
case 7:return 55
break;
case 8:return 33
break;
case 9:return 35
break;
case 10:yy_.yytext = this.matches[3]; return 52
break;
case 11:yy_.yytext = this.matches[this.matches.length - 1]; return 71
break;
case 12:return 69
break;
case 13:return 70
break;
case 14:return 48
break;
case 15:return 49
break;
case 16:return 57
break;
case 17:return 58
break;
case 18:return 46  /* rely on mathquill */
break;
case 19:return 47 /* for pairing */
break;
case 20:return 31
break;
case 21:return 29
break;
case 22:return 13
break;
case 23:return 59
break;
case 24:return 50
break;
case 25:return 5
break;
case 26:return 22
break;
case 27:return 23
break;
case 28:return 20
break;
case 29:return 21
break;
case 30:return 60
break;
case 31:return 62
break;
case 32:return 65
break;
case 33:return 27
break;
case 34:return 28
break;
case 35:return 26
break;
case 36:return 25
break;
case 37:return 15
break;
case 38:return 14 
break;
case 39:return 67        /* sin, cos, sinh, ln*/
break;
case 40:yy_.yytext = '\\sign'; return 17
break;
case 41:yy_.yytext = '\\gcd'; return 17
break;
case 42:yy_.yytext = '\\lcm'; return 17
break;
case 43:return 17          /* Predefined functions, as well as user-defined variables.  Doesn't include subscripts */
break;
case 44:/* skip LINE_START if it's not needed for something else */
break;
case 45:return 'UNRECOGNIZED'
break;
}
};
lexer.rules = [/^(?:(\\space|\\:|\s)+)/,/^(?:\{)/,/^(?:\})/,/^(?:\$)/,/^(?:\^([0-9]))/,/^(?:\^([a-zA-Z]))/,/^(?:\^)/,/^(?:[0-9]+(\.[0-9]+)?|(\.[0-9]+))/,/^(?:\*|(\\cdot))/,/^(?:\/)/,/^(?:(\\frac((?:\s|\\space|\\:)*)\{d\}\{d(((\\[a-zA-Z]+|[a-zA-Z])(_[a-zA-Z0-9]|_\{[a-zA-Z0-9]+\})?))\}))/,/^(?:(\\log)((?:\s|\\space|\\:)*)*_([0-9]))/,/^(?:(\\ln))/,/^(?:(\\log))/,/^(?:(\\frac))/,/^(?:(\\sqrt))/,/^(?:(\\sum))/,/^(?:(\\prod))/,/^(?:\\left\|)/,/^(?:\\right\|)/,/^(?:-)/,/^(?:\+)/,/^(?:=)/,/^(?:[_])/,/^(?:!)/,/^(?:$)/,/^(?:(\()|\\left\()/,/^(?:(\))|\\right\))/,/^(?:(\[)|\\left\[)/,/^(?:(\])|\\right\])/,/^(?:(\\\{)|\\left\\\{)/,/^(?:(\\\})|\\right\\\})/,/^(?::)/,/^(?:(\\ge|>=))/,/^(?:(\\le|<=))/,/^(?:(\\gt|>))/,/^(?:(\\lt|<))/,/^(?:,)/,/^(?:(###)(((?:\s|\\space|\\:)*)((\\[a-zA-Z]+|[a-zA-Z])(_[a-zA-Z0-9]|_\{[a-zA-Z0-9]+\})?)((?:\s|\\space|\\:)*)(\\left\(|\()((?:\s|\\space|\\:)*)((\\[a-zA-Z]+|[a-zA-Z])(_[a-zA-Z0-9]|_\{[a-zA-Z0-9]+\})?)(((?:\s|\\space|\\:)*),((?:\s|\\space|\\:)*)((\\[a-zA-Z]+|[a-zA-Z])(_[a-zA-Z0-9]|_\{[a-zA-Z0-9]+\})?)((?:\s|\\space|\\:)*))*((?:\s|\\space|\\:)*)(\\right\)|\))((?:\s|\\space|\\:)*)=))/,/^(?:(\\(arc)?(sin|cos|tan|cot|sec|csc)h?))/,/^(?:(\\signum))/,/^(?:(\\(gcf|mcd)))/,/^(?:(\\mcm))/,/^(?:((\\[a-zA-Z]+|[a-zA-Z])(_[a-zA-Z0-9]|_\{[a-zA-Z0-9]+\})?))/,/^(?:(###))/,/^(?:.)/];
lexer.conditions = {"conditional":{"rules":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45],"inclusive":true},"INITIAL":{"rules":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45],"inclusive":true}};
return lexer;})()
parser.lexer = lexer;
return parser;
});
define('math/inverses',[],function () {
  var inverses = {};

  // Functions with an inverse spelled arcname
  var arcNames = [
    'sin',
    'cos',
    'tan',
    'cot',
    'sec',
    'csc',
    'sinh',
    'cosh',
    'tanh',
    'coth',
    'sech',
    'csch'
  ];

  arcNames.forEach(function (name) {
    inverses[name] = 'arc' + name;
    inverses['arc' + name] = name;
  });

  return inverses;
});
var define_enum_constant;
var enum_strings = {};
var debuggable_enums = true;

if(debuggable_enums){
  define_enum_constant = function(s){
    this[s] = s;
  };
}
else{
  var next_enum = 1000;
  define_enum_constant = function(s){
    enum_strings[next_enum] = s;
    this[s] = next_enum++;
  };
}

//Statement types (determined entirely from the root element of the parse tree)
define_enum_constant("EXPRESSION");              //a+1 or 1+1
define_enum_constant("FUNCTION_DEFINITION");     //f(x)=???
define_enum_constant("VARIABLE_DEFINITION");     //a=???
define_enum_constant("ORDERED_PAIR_LIST");     // (?, ?), (?, ?).  Support lists of points, but only single parametrics
define_enum_constant("DOUBLE_INEQUALITY");       // expr < y < expr, shade-between
define_enum_constant("COMPARATOR");       // expr < expr - unsolved inequality
define_enum_constant("CHAINED_COMPARATOR");       // a < ??? - not a conditional as an expression
define_enum_constant("EQUATION");         // expr = expr
define_enum_constant("CONSTANT");
define_enum_constant("IDENTIFIER");

define("math/enums", function(){});

define('math/parser_util',['require','pjs','./evalframe','./comparators','parser','./inverses','./builtin','./enums'],function(require){
  /* jshint maxlen: false */
  var P = require('pjs');
  var EvalFrame = require('./evalframe');
  var Comparators = require('./comparators');
  var latex = require('parser');
  var inverses = require('./inverses');
  var BuiltIn = require('./builtin');
  require('./enums');

var exports = {};

latex.yy.inverses = inverses;

var ParseNode = exports.ParseNode = P(function (node) {
  node.init = function () {
    this._dependencies = {};
    this._referencedSymbols = {};
  };
  //TODO - consider just storing ranges, and linking them to the latex string at request time
  node.setInputString = function (s) {
    this._inputString = s;
  };
  node.getInputString = function () {
    return this._inputString;
  };
  node.statementType = EXPRESSION;
  node.assigns = null;
  node.valid = true;
  node.exportDefinitionsTo = function (frame, compiler) {};
  node.evaluateOnce = function (frame) {return "Unable to evaluate"};
  node.addDependency = function (identifier, arity) {
    //_dependency stores the identifiers which are depended on, as well as their required arity/type
    //0 => variable
    //1 => ambiguous between unary function and implicit multiplication
    //n>1 => function of arity n
    this.referenceSymbol(identifier);
  
    if(!this._dependencies.hasOwnProperty(identifier)) { //New dependency
      this._dependencies[identifier] = arity;
      return;
    }

    //We already depend on this, need to make sure new and old dependencies are consistent
    var prior_arity = this._dependencies[identifier];

    if (arity === prior_arity) { return } //Consistent - no change to dependency structure

    if (arity === 1 && prior_arity === 0) { return } //New ambiguous entry is consistent with prior variable definition

    if (arity === 0 && prior_arity === 1) {
      this._dependencies[identifier] = arity;  //Dependency on identifier as a variable resolves previous ambiguity
      return;
    }

    if (arity === 0 || prior_arity === 0) {
      throw("You're referencing '" + identifier + "' as both a function and a variable. Make up your mind!");
    } else {
      throw("You're referencing '" + identifier + "' as both a " + prior_arity + "-variable and a " + arity + "-variable function. Make up your mind!");
    }
  };

  node.referenceSymbol = function (identifier) {
    this._referencedSymbols[identifier] = true;
  };

  node.shadowVariable = function (identifier) {
    this.referenceSymbol(identifier);
    if(!this._dependencies.hasOwnProperty(identifier)) return;

    var prior_arity = this._dependencies[identifier];
    if(prior_arity <= 1) {
      delete this._dependencies[identifier];
      return;
    }
    throw("Cannot redefine function "+identifier+" as a variable");
  };

  node.addDependencies = function (dependencies) {
    for (var identifier in dependencies) {
      if(!dependencies.hasOwnProperty(identifier)) continue;

      var arity = dependencies[identifier];
      this.addDependency(identifier, arity);
    }
  };

  //Used to determine re-computation dependencies
  //Needs to be different than dependencies, because f(a)=a doesn't depend on a, but throws an error when a is defined
  node.references = function (identifier) {
    if(this._referencedSymbols[identifier]) return true; //For shadowed varibles, etc.
  };

  node.dependencies = function () {
    return this._dependencies;
  };

  node.getEvalStrings = function () {
    throw("Cannot call getEvalStrings on base ParseNode");
  };

  node.polynomialOrder = function () {
    return Infinity;
  };

  //Generate non-colliding names
  //To play it safe, we want to never re-use temp variables;
  //This shouldn't wrap around until 2^52.  2^52 microseconds is 142 years.
  //All variables will be of the form tmp123, which we don't allow as a real variable name
  node.uid_counter = [0]; //Same reference for everyone
  node.tmp = function () {
    return 'tmp'+this.uid_counter[0]++;
  };

  node.okForImplicitFunction = function () {
    return false;
  };
 
});

exports.AssignmentNode = P(ParseNode, function (node, _super) {
  node.init = function (identifier, expression) {
    _super.init.call(this);
    this.assigns = identifier;
    this.referenceSymbol(this.assigns.identifier);
    this.arity = 0;
    this.expression = expression;
    this.addDependencies(expression.dependencies());
    this.lhs = identifier; //masquerade as equation
    this.rhs = expression; //masquerade as equation
    //Decide if we should act as an assignment or an equation
    //TODO - may want this policy to live somewhere else
    //Current policy is just whether we have a circular dependency
    if(this.dependencies().hasOwnProperty(this.assigns.identifier)) {
      this.statementType = EQUATION;
    }
  };
  node.statementType = VARIABLE_DEFINITION;
  node.evaluateOnce = function (frame) {
    return this.expression.evaluateOnce(frame);
  };
  node.exportDefinitionsTo = function (frame, compiler) {  //Uses the same frame as evaluation context
    if(this.statementType === EQUATION) return;
    try{
      var constant_value = this.expression.evaluateOnce(frame);
      var constant_node = ConstantNode(constant_value);
      frame.setVariable(this.assigns.identifier, constant_node);
      frame.setEvalStrings(this.assigns.identifier, constant_node.getEvalStrings(frame));
    }
    catch(e) {
      frame.setVariable(this.assigns.identifier, this.expression);
      frame.setEvalStrings(this.assigns.identifier, this.expression.getEvalStrings(frame));
    }
  };
  node.getEvalStrings = function (frame) {
    if(this.statementType === EQUATION) return _super.getEvalStrings(frame);
    return this.expression.getEvalStrings(frame);
  };
  
  node.toString = function () {
    return this.assigns + ' = ' + this.expression;
  };
});

exports.DoubleInequalityNode = P(ParseNode, function (node, _super) {
  node.init = function (expression1, comparator1, expressionm, comparator2, expression2) {
    _super.init.call(this);
    this._inequalities = [];

    if(Comparators.table[comparator1].direction != Comparators.table[comparator2].direction) {
      throw "Double inequalities must both go the same way, e.g. 1 < y < 2"; //TODO - need better error message
    }

    this.direction = Comparators.table[comparator1].direction;
    this.inclusive = (
        Comparators.table[comparator1].inclusive &&
        Comparators.table[comparator2].inclusive
    );
    var validity_comparator = Comparators.get(this.inclusive, this.direction);

    var valid_predicate = ComparatorNode(validity_comparator, expression1, expression2);
    var expression1_valid = PiecewiseNode(valid_predicate, expression1);
    var expression2_valid = PiecewiseNode(valid_predicate, expression2);

    this._inequalities.push(ComparatorNode(comparator1, expressionm,  expression1_valid)); //TODO - invert comparator
    this._inequalities.push(ComparatorNode(comparator2, expressionm, expression2_valid));


    this.addDependencies(expressionm.dependencies());
    this.addDependencies(expression1.dependencies());
    this.addDependencies(expression2.dependencies());

    node.statementType = DOUBLE_INEQUALITY;
  };

  node.getInequality = function (i) {
    return this._inequalities[i];
  };
});

exports.EquationNode = P(ParseNode, function (node, _super) {
  node.init = function (lhs, rhs) {
    _super.init.call(this);
    this.lhs = lhs;
    this.rhs = rhs;
    this.addDependencies(lhs.dependencies());
    this.addDependencies(rhs.dependencies());
  };

  node.statementType = EQUATION;

  node.toString = function () { return this.lhs + ' = ' + this.rhs; };
});

//Represents if-else
var PiecewiseNode = exports.PiecewiseNode = P(ParseNode, function (node, _super) {
  node.init = function (condition, if_expr, else_expr) {
    _super.init.call(this);
    this.condition = condition;
    this.if_expr = if_expr;
    this.frozen = false;
    if(else_expr) {
      this.else_expr = else_expr;
      this.addDependencies(this.else_expr._partial_dependencies());
    }
    this.addDependencies(condition.dependencies());
    this.addDependencies(if_expr.dependencies());
    //TODO - add dependencies
  };

  //Don't want to freeze dependencies while building the if-else chain
  //Only want to freeze once someone else asks about our dependencies, since they won't update in response to changes
  node._partial_dependencies = function () {
    return _super.dependencies;
  };

  //Chained if-else nodes (from {a:b, c:d, e} notation) are created by passing each subsequent clause down the parse tree, updating dependencies as it goes.
  //This is only valid when used "correctly" (e.g. start passing in the from the top node, and only pass during construction, not after use)
  node.append_else = function (else_expr) {
    if(this.frozen) throw("Programming Error - please treat me as immutable.  Cannot change PiecewiseNode after getting dependencies");
    if(this.else_expr) {
      this.else_expr.append_else(else_expr);
    }
    else{
      this.else_expr = else_expr;
    }
    this.addDependencies(else_expr.dependencies());  //Needs to be added to everyone all the way down the if-else chain to have correct dependencies for the whole tree.
    return this;
  };

  node.evaluateOnce = function (frame) {
    this.frozen = true;
    if(this.condition.evaluateOnce(frame)) {
      return this.if_expr.evaluateOnce(frame);
    }
    else if (this.else_expr) {
      return this.else_expr.evaluateOnce(frame);
    }
    return undefined;
  };

  node.getEvalStrings = function (frame) {
    var condition_strings = this.condition.getEvalStrings(frame);
    var if_strings = this.if_expr.getEvalStrings(frame);
    var else_strings;

    if(this.else_expr) {
      else_strings = this.else_expr.getEvalStrings(frame);
    }
    else{
      else_strings = {statements:'', expression:'undefined'};
    }

    var result = this.tmp();
    var statements = 'var '+result+';'+condition_strings.statements+
                     'if('+condition_strings.expression+') {'+
                      if_strings.statements+result+'='+if_strings.expression+
                     ';}else{'+
                      else_strings.statements+result+'='+else_strings.expression+';}';
    return { expression: result, statements: statements };
  };

  node.polynomialOrder = function (frame, variable) {
    if(this.dependencies().hasOwnProperty(variable)) {
      return Infinity;
    }
    else{
      return 0;
    }
  };

  node.quadraticCoefficients = function (frame, variable) {
    return [0, 0, this.evaluateOnce(frame)];
  };

  node.polynomialEvalStrings = function (frame, variable, arg) {
    var eval_strings = this.getEvalStrings(frame);
    return {statements:eval_strings.statements, expressions:[eval_strings.expression]};
  };

  node.toString = function () {

    if (!this.else_expr) {
      return '\\left\\{' +
        this.condition + ': ' + this.if_expr +
        '\\right\\}';
    }

    // Can't reparse literal true, so use special form.
    var elseString;
    if (this.else_expr.condition && this.else_expr.condition.value === true) {
      elseString = String(this.else_expr.if_expr);
    } else {
      // Unwind elses
      elseString = String(this.else_expr).replace(/^\\left\\\{(.*)\\right\\\}$/, '$1');
    }

    return '\\left\\{' +
      this.condition + ': ' + this.if_expr + ', ' + elseString +
      '\\right\\}';
  };

});

exports.OrderedPairNode = P(ParseNode, function (node, _super) {
  node.init = function (first, second) {
    _super.init.call(this);
    this.children = [first, second];
    this.addDependencies(first.dependencies());
    this.addDependencies(second.dependencies());
  };

  node.getEvalStrings = function (frame) {
    var first_strings = this.children[0].getEvalStrings(frame);
    var second_strings = this.children[1].getEvalStrings(frame);
    var statements = first_strings.statements + second_strings.statements;
    var expression = '['+first_strings.expression+','+second_strings.expression+']';
    return {statements: statements, expression:expression};
  };

  node.evaluateOnce = function (frame) {
    return [this.children[0].evaluateOnce(frame), this.children[1].evaluateOnce(frame)];
  };
  
  this.toString = function () {
    return '\\left(' +
      this.children[0] + ', ' +
      this.children[1] +
    '\\right)';
  };
});

var ErrorNode = exports.ErrorNode = P(ParseNode, function (node, _super) {
  node.init = function (msg) {
    _super.init.call(this);
    this.error_msg = msg;
  };
  node.valid = false;

  this.evaluateOnce = function (frame) {
    return this.error_msg;
  };
});

var ConstantNode = exports.ConstantNode = P(ParseNode, function (node, _super) {
  node.init = function (value) {
    _super.init.call(this);
    this.value = value;
  };
  node.evaluateOnce = function (frame) {
    return this.value;
  };
  node.getEvalStrings = function () {
    var statements = '';
    var expression = (this.value < 0 ? '('+String(this.value)+')' : String(this.value));
    return {expression:expression, statements:statements};
  };
  node.quadraticCoefficients = function (frame, variable) {
    return [0, 0, this.value];
  };
  node.polynomialEvalStrings = function (frame, variable, arg) {
    return {statements:'', expressions:['('+String(this.value)+')']};
  };

  node.polynomialOrder = function (frame, variable) {
    return 0;
  };

  node.okForImplicitFunction = function () {
    return true;
  };
  
  node.toString = function () { return String(this.value); };
  
  node.statementType = CONSTANT;
});

var NegationNode = exports.NegationNode = P(ParseNode, function (node, _super) {
    node.init = function (expression) {
      _super.init.call(this);
      this.expression = expression;
      this.addDependencies(this.expression.dependencies());
    };
    node.evaluateOnce = function (frame) {
      return -(this.expression.evaluateOnce(frame));
    };
    node.quadraticCoefficients = function (frame, variable) {
      var coeffs = this.expression.quadraticCoefficients(frame, variable);
      return [-coeffs[0], -coeffs[1], -coeffs[2]];
    };
    node.polynomialEvalStrings = function (frame, variable, arg) {
      var strings = this.expression.polynomialEvalStrings(frame, variable, arg);
      for (var i = 0; i < strings.expressions.length; i++) {
        strings.expressions[i] = '(-'+strings.expressions[i]+')';
      }
      return strings;
    };
    node.polynomialOrder = function (frame, variable) {
      return this.expression.polynomialOrder(frame, variable);
    };
    node.getEvalStrings = function (frame) {
      var evalStrings = this.expression.getEvalStrings(frame);
      return {expression:'(-'+evalStrings.expression+')', statements:evalStrings.statements};
    };
    node.toString = function () { return '-' + this.expression; };
    
});

var IdentifierNode = exports.IdentifierNode = P(ParseNode, function (node, _super) {
  node.init = function (identifier) {
    _super.init.call(this);
    identifier = identifier.replace('\\', ''); //TODO - want to verify this remapping
    identifier = identifier.replace('{', '');
    identifier = identifier.replace('}', '');
    this.identifier = identifier;
    this.addDependency(this.identifier, 0);
  };
  node.evaluateOnce = function (frame) {
    return frame.getVariable(this.identifier).evaluateOnce(frame);
  };
  node.getEvalStrings = function (frame) {
    return frame.getEvalStrings(this.identifier);
  };
  node.quadraticCoefficients = function (frame, variable) {
    if (variable === this.identifier) {
      return [0, 1, 0];
    }
    else{
      var tree = frame.getVariable(this.identifier);
      return tree.quadraticCoefficients(frame, variable);
    }
  };
  node.polynomialEvalStrings = function (frame, variable, arg) {
    if(variable === this.identifier) {
      return {statements:'', expressions:['0', '1']};
    }
    else if(arg === this.identifier) {
      return {statements:'', expressions:[this.identifier]};
    }
    else{
      var tree = frame.getVariable(this.identifier);
      return tree.polynomialEvalStrings(frame, variable, arg);
    }
  };
  node.polynomialOrder = function (frame, variable) {
    if(variable === this.identifier) return 1;
    if(!frame.hasVariable(this.identifier)) return 0;
    var tree = frame.getVariable(this.identifier);
    return tree.polynomialOrder(frame, variable);
  };
  node.okForImplicitFunction = function () {
    return true;
  };

  node.toString = function () {
    var m = this.identifier.match(/^([^_]+)(_(.*))?$/);
    var base = m[1];
    var subscript = m[3];

    if (base.length > 1) base = '\\' + base;
    if (!subscript) return base;
    return base + '_{' + subscript + '}';
  };
  
  node.statementType = IDENTIFIER;
});

exports.ChainedComparatorNode = P(ParseNode, function (node, _super) {
  node.init = function (comparators, args) {
    _super.init.call(this);
    if(!(comparators.length === 2 && args.length === 3)) throw "Can't chain more than 2 comparators";

    this.comparators = comparators;
    this.args = args;
    

    for (var i = 0; i  < 3; i++) {
      this.addDependencies(args[i].dependencies());
    }

    this.node1 = ComparatorNode(this.comparators[0], this.args[0], this.args[1]);
    this.node2 = ComparatorNode(this.comparators[1], this.args[1], this.args[2]);
  };

  node.evaluateOnce = function (frame) {
    return this.node1.evaluateOnce(frame) && this.node2.evaluateOnce(frame);
  };

  //TODO - stop double-evaluating middle value
  node.getEvalStrings = function (frame) {
    var s1 = this.node1.getEvalStrings(frame);
    var s2 = this.node2.getEvalStrings(frame);
    var statements = s1.statements + s2.statements;
    var expression =  "(" + s1.expression + "&&" + s2.expression + ")";
    return {expression:expression, statements:statements};
  };
  
  node.toString = function () {
    return [
      this.args[0],
      this.comparators[0],
      this.args[1],
      this.comparators[1],
      this.args[2]
    ].join(' ');
  };
  
  node.statementType = CHAINED_COMPARATOR;
});

var BinaryOperatorTable = {
  '+': 'arg1+arg2',
  '-': 'arg1-arg2',
  '*': 'arg1*arg2',
  '/': 'arg1/arg2',
  '>' : 'arg1>arg2',
  '<' : 'arg1<arg2',
  '>=': 'arg1>=arg2',
  '<=': 'arg1<=arg2',
  '===': 'arg1===arg2',
  '^': 'this.pow(arg1, arg2)' //Function not compiled from this text
};


var BinaryOperatorFunctionTable = {};
for (var operator in BinaryOperatorTable) {
  /*jshint evil:true*/
  if(BinaryOperatorTable.hasOwnProperty(operator)) {
    var fn;
    if(operator === '^')
      fn = BuiltIn.pow;
    else
      fn = new Function(['arg1', 'arg2'], 'return ' + BinaryOperatorTable[operator]);
    BinaryOperatorFunctionTable[operator] = fn;
  }
}

var BinaryOperatorNode = exports.BinaryOperatorNode = P(ParseNode, function (node, _super) {
  node.init = function (operator, x1, x2) {
    _super.init.call(this);
    this.args = [x1, x2];
    this.operator = operator;
    this.evaluator = BinaryOperatorFunctionTable[operator];
    this.addDependencies(this.args[0].dependencies());
    this.addDependencies(this.args[1].dependencies());
  };

  node.evaluateOnce = function (frame) {
    return this.evaluator(this.args[0].evaluateOnce(frame), this.args[1].evaluateOnce(frame));
  };

  node.getEvalStrings = function (frame) {
    var s0 = this.args[0].getEvalStrings(frame);
    var s1 = this.args[1].getEvalStrings(frame);
    var template = BinaryOperatorTable[this.operator];
    var expression = '(' +
      template.replace('arg1', s0.expression)
      .replace('arg2', s1.expression) +
    ')';
    var statements = s0.statements + s1.statements;
    return { expression: expression, statements: statements };
  };

  node.quadraticCoefficients = function (frame, variable) {
    var coeffs0 = this.args[0].quadraticCoefficients(frame, variable);
    var coeffs1 = this.args[1].quadraticCoefficients(frame, variable);

    switch(this.operator) {
    case '+':
      return [coeffs0[0] + coeffs1[0], coeffs0[1] + coeffs1[1], coeffs0[2] + coeffs1[2]];

    case '-':
      return [coeffs0[0] - coeffs1[0], coeffs0[1] - coeffs1[1], coeffs0[2] - coeffs1[2]];

    case '*':
      var new_coeffs = [0, 0, 0, 0, 0];
      for (var i = 0; i <= 2; i++) {
        for (var j = 0; j <= 2; j++) {
          new_coeffs[i+j] += coeffs0[i] * coeffs1[j];
        }
      }
      var invalid_coeffs = new_coeffs.splice(0, 2);  //invalid_coeffs gets first 2 coeffs.  Last 3 stay in new_coeffs.
      if (invalid_coeffs[0] !== 0 || invalid_coeffs[1] !== 0) return [NaN, NaN, NaN]; //throw "Greater than quadratic";
      return new_coeffs;

    case '/':
      if(coeffs1[0] !== 0 || coeffs1[1] !== 0) return [NaN, NaN, NaN]; //throw "Can't solve with x in the denominator";
      return [coeffs0[0] / coeffs1[2], coeffs0[1] / coeffs1[2], coeffs0[2] / coeffs1[2]];

    case '^':
      // Exponent can't depend on variable
      if(coeffs1[0] !== 0 || coeffs1[1] !== 0) return [NaN, NaN, NaN];//throw "Can't solve with x in the exponent";

      //If we don't depend on x, return [0, 0, evalOnce];
      if(coeffs0[0] === 0 && coeffs0[1] === 0) {
        return [0, 0, this.evaluator(coeffs0[2], coeffs1[2])]; //optimization for this.evaluateOnce(frame), since we already have our arguments.
      }
      
      //Otherwise, only return if exponent is small constant positive integer
      if (coeffs1[2] === 1) return coeffs0;
      if (coeffs1[2] === 2) {
        if(coeffs0[0] !== 0) return [NaN, NaN, NaN];//throw "Greater than quadratic";
        return [coeffs0[1] * coeffs0[1], 2 * coeffs0[1] * coeffs0[2], coeffs0[2] * coeffs0[2]];
      }
    }
    return [NaN, NaN, NaN];
  };

  node.polynomialEvalStrings = function (frame, variable, arg) {
    var coeffs0 = this.args[0].polynomialEvalStrings(frame, variable, arg);
    var coeffs1 = this.args[1].polynomialEvalStrings(frame, variable, arg);
    var order0 = coeffs0.expressions.length - 1;
    var order1 = coeffs1.expressions.length - 1;
    var statements = coeffs0.statements+coeffs1.statements;
    var expressions = [];
    var i, j, term;

    switch(this.operator) {
    case '+':
    case '-':
      for (i = 0; i <= Math.min(order0, order1); i++) {
        expressions[i] = '('+coeffs0.expressions[i]+this.operator+coeffs1.expressions[i]+')';
      }
      for (i = Math.min(order0, order1) + 1; i <= Math.max(order0, order1); i++) {
        if(this.operator === '+') {
          expressions[i] = (order0 > order1 ? coeffs0.expressions[i] : coeffs1.expressions[i]);
        }
        if(this.operator === '-') {
          expressions[i] = (order0 > order1 ? coeffs0.expressions[i] : '(-'+coeffs1.expressions[i]+')');
        }
      }
      return {statements: statements, expressions:expressions};

    case '*':
      for (i = 0; i <= order0; i++) {
        for (j = 0; j <= order1; j++) {
          term = '('+coeffs0.expressions[i]+'*'+coeffs1.expressions[j]+')';
          if(expressions[i+j] === undefined) {
            expressions[i+j] = term;
          }
          else{
            expressions[i+j] += '+'+term;
          }
        }
      }
      for (i = 0; i < expressions.length; i++) {
        expressions[i] = '(' + expressions[i] + ')';
      }
      return {statements:statements, expressions:expressions};
    case '/':
      if(order1 >= 1) throw "can't solve for variable in denominator";
      for (i=0; i <= order0; i++) {
        expressions[i] = '((' + coeffs0.expressions[i] + ')' + '/' + '(' + coeffs1.expressions[0] + '))';
      }
      return {statements:statements, expressions:expressions};
    case '^':
      if(order1 >= 1) throw "can't solve for variable in exponent";
      //Compute it if the base doesn't depend on the variable
      if(order0 === 0) return {statements:statements, expressions:['this.pow('+coeffs0.expressions[0]+','+coeffs1.expressions[0]+')']};
      //Only continue if the exponent is a small, constant, integer.  Figure this out with tree.evaluateOnce(frame).
      //If we can't evaluate, this will throw and solving will fail
      var exponent = this.args[1].evaluateOnce(frame);
      switch(exponent) {
      case 0:
        return {statements:'', expressions:['1']};
      case 1:
        return coeffs1;
      case 2:
        for (i = 0; i <= order0; i++) {
          for (j = 0; j <= order0; j++) {
            term = '('+coeffs0.expressions[i]+'*'+coeffs0.expressions[j]+')';
            if(expressions[i+j] === undefined) {
              expressions[i+j] = term;
            }
            else{
              expressions[i+j] += '+'+term;
            }
          }
        }
        for (i = 0; i < expressions.length; i++) {
          expressions[i] = '(' + expressions[i] + ')';
        }
        return {statements:statements, expressions:expressions};
      }
    }
    throw "Unable to compile polyomial representation of BinaryOperatorNode";
  };

  node.polynomialOrder = function (frame, variable) {
    var order0 = this.args[0].polynomialOrder(frame, variable);
    var order1 = this.args[1].polynomialOrder(frame, variable);
    switch(this.operator) {
    case '+':
    case '-':
      return Math.max(order0, order1);
    case '*':
      return order0 + order1;
    case '/':
      if (order1 > 0) return Infinity;
      return order0;
    case '^':
      if(order0 === 0 && order1 === 0) return 0;
      try{
        var exponent = this.args[1].evaluateOnce(frame);
        if (exponent !== Math.round(exponent)) return Infinity;
        if (exponent < 0) return Infinity;
        return exponent * order0;
      }
      catch(e) {
        return Infinity; //Exponent depends on free variables
      }
    }
    return Infinity;
  };

  node.okForImplicitFunction = function () {
    return this.args[0].okForImplicitFunction() && this.args[1].okForImplicitFunction();
  };

  var powString = function (base, exponent) {
    var baseString = base.toString();
    var exponentString = exponent.toString();
    if (base instanceof BinaryOperatorNode) {
      baseString = '(' + baseString + ')';
    }
    if (exponent instanceof BinaryOperatorNode) {
      exponentString = '{' + exponentString + '}';
    }
    return baseString + '^' + exponentString;
  };

  var timesString = function (arg1, arg2) {
    var s1 = String(arg1);
    var s2 = String(arg2);
    if (
      (
        arg1 instanceof BinaryOperatorNode &&
        (arg1.operator === '+' || arg1.operator === '-')
      ) ||
      arg1 instanceof NegationNode
    ) {
      s1 = '(' + s1 + ')';
    }
    if (
      (
        arg2 instanceof BinaryOperatorNode &&
        (arg2.operator === '+' || arg2.operator === '-')
      ) ||
      arg2 instanceof NegationNode
    ) {
      s2 = '(' + s2 + ')';
    }
    return s1 + '*' + s2;
  };

  node.toString = function () {
    if (this.operator === '^') return powString(this.args[0], this.args[1]);
    if (this.operator === '/') {
      return '\\frac{' + this.args[0] + '}{' + this.args[1] + '}';
    }
    if (this.operator === '*') return timesString(this.args[0], this.args[1]);
    return this.args[0] + ' ' + this.operator + ' ' + this.args[1];
  };

});

var ComparatorNode = exports.ComparatorNode = P(BinaryOperatorNode, function (node, _super) {
  node.init = function (operator, x1, x2) {
    _super.init.call(this, operator, x1, x2);
  };
  
  node.polynomialOrder = function (frame, variable) {
    var order0 = this.args[0].polynomialOrder(frame, variable);
    var order1 = this.args[1].polynomialOrder(frame, variable);
    return Math.max(order0, order1);
  };
  
  node.quadraticCoefficients = function (frame, variable) {
    return [NaN, NaN, NaN]; //TODO Not implemented
  };
  
  node.statementType = COMPARATOR;
  
});

var FunctionNode = exports.FunctionNode = P(ParseNode, function (node, _super) {
  node.init = function (identifier, args) {
    _super.init.call(this);
    this.identifier = identifier;
    this.args = args;
    this.arity = this.args.length;
    this.addDependency(this.identifier.identifier, this.arity);
    for (var i = 0; i < args.length; i++) {
      this.addDependencies(args[i].dependencies());
    }
  };

  node.evaluateOnce = function (frame) {
    if(this.arity > 1 || frame.hasFunction(this.identifier.identifier)) {
      return frame.callFunction(this.identifier.identifier,
                                this.args.map(function (arg) {return arg.evaluateOnce(frame)}));
    }
    //We don't have a function.  This could be implicit multiplication instead.
    if(this.args.length === 1 && frame.hasVariable(this.identifier.identifier)) {
      return this.args[0].evaluateOnce(frame) * frame.getVariable(this.identifier.identifier).evaluateOnce(frame);
    }
  };

  node.getEvalStrings = function (frame) {
    if(this.arity > 1 || frame.hasFunction(this.identifier.identifier)) {
      var arg_eval_strings = this.args.map(function (a) {return a.getEvalStrings(frame)});
      var arg_expressions = arg_eval_strings.map(function (a) {return a.expression});
      var arg_statements = arg_eval_strings.map(function (a) {return a.statements});
      var statements = arg_statements.join('');
      var expression = 'this.'+this.identifier.identifier + '(' + arg_expressions.join(',') + ')';
      return {expression:expression, statements:statements};
    }
    else{
      var variable_node = IdentifierNode(this.identifier.identifier);
      var multiplication_node = BinaryOperatorNode('*', variable_node, this.args[0]);
      return multiplication_node.getEvalStrings(frame);
    }
  };

  node.quadraticCoefficients = function (frame, variable) {
    if(this.arity > 1 || frame.hasFunction(this.identifier.identifier)) {
      /*Find polynomial order for each function argument*/
      var arg_orders = this.args.map(function (a) {return a.polynomialOrder(frame, variable)});
      var max_order = Math.max.apply(null, arg_orders);

      //Return static value if no arguments depend on X
      if(max_order === 0) {
        return [0, 0, this.evaluateOnce(frame)];
      }

      //Return infinity if arguments depend on X, and can't be analyzed
      var fn = frame.getFunctionTree(this.identifier.identifier);
      if(!fn) throw ("Can't solve equations with " + this.identifier.identifier);

      //Create local frame and ask function expression for polynomial order
      var local_frame = EvalFrame(frame);
      for (var i = 0; i < fn.arity; i++) {
        local_frame.setVariable(fn.args[i].identifier, this.args[i]);
      }
      return fn.expression.quadraticCoefficients(local_frame, variable);
    }
    else{ //Implicit multiplication
      var variable_node = IdentifierNode(this.identifier.identifier);
      var multiplication_node = BinaryOperatorNode('*', variable_node, this.args[0]);
      return multiplication_node.quadraticCoefficients(frame, variable);
    }
  };

  node.polynomialEvalStrings = function (frame, variable, arg) {
    if(this.arity > 1 || frame.hasFunction(this.identifier.identifier)) {
      var arg_strings = this.args.map(function (a) {return a.polynomialEvalStrings(frame, variable, arg)});
      var arg_orders = arg_strings.map(function (x) {return x.expressions.length - 1;});
      var max_order = Math.max.apply(null, arg_orders);

      if(max_order === 0) {
        var eval_strings = this.getEvalStrings(frame);
        return {statements:eval_strings.statements, expressions:[eval_strings.expression]};
      }
      //If order is infinity, this shouldn't get called?
      //TODO - deal wih "create local frame" logic from polynomialOrder
    }
    else{ //Implicit multiplication
      var variable_node = IdentifierNode(this.identifier.identifier);
      var multiplication_node = BinaryOperatorNode('*', variable_node, this.args[0]);
      return multiplication_node.polynomialEvalStrings(frame, variable, arg);
    }
  };

  node.polynomialOrder = function (frame, variable) {
    if(this.arity > 1 || frame.hasFunction(this.identifier.identifier)) {
      /*Find polynomial order for each function argument*/
      var arg_orders = this.args.map(function (a) {return a.polynomialOrder(frame, variable)});
      var max_order = Math.max.apply(null, arg_orders);

      //Return 0 if no arguments depend on X
      if(max_order === 0) {
        return 0;
      }

      return Infinity; //TODO - analyze order of function calls that depend on X
    }
    else{ //Implicit multiplication
      var variable_node = IdentifierNode(this.identifier.identifier);
      var multiplication_node = BinaryOperatorNode('*', variable_node, this.args[0]);
      return multiplication_node.polynomialOrder(frame, variable);
    }
  };

  node.toString = function () {
    if (this.identifier.identifier === 'sqrt') {
      return this.identifier + '{' + this.args[0] + '}';
    }
    return this.identifier + '(' + this.args.join(', ') + ')';
  };
});

exports.FunctionCallExponentNode = P(ParseNode, function (node, _super) {
  node.init = function (identifier, arg, exponent) {
    _super.init.call(this);
    this.identifier = identifier;
    this.arg = arg;
    this.exponent = exponent;
    this.as_function_node = BinaryOperatorNode('^', FunctionNode(this.identifier, [this.arg]), this.exponent);
    this.as_multiplication_node = BinaryOperatorNode('*', this.identifier, BinaryOperatorNode('^', this.arg, this.exponent));

    this.addDependency(this.identifier.identifier, 1);  //Ambiguous (see note in addDependency)
    this.addDependencies(this.arg.dependencies());
    this.addDependencies(this.exponent.dependencies());
  };

  node.getEquivalentNode = function (frame) {
    if(frame.hasFunction(this.identifier.identifier)) return this.as_function_node;
    return this.as_multiplication_node;
  };

  node.evaluateOnce = function (frame) {
    return this.getEquivalentNode(frame).evaluateOnce(frame);
  };

  node.getEvalStrings = function (frame) {
    return this.getEquivalentNode(frame).getEvalStrings(frame);
  };

  node.polynomialOrder = function (frame, variable) {
    return this.getEquivalentNode(frame).polynomialOrder(frame, variable);
  };

  node.quadraticCoefficients = function (frame, variable) {
    return this.getEquivalentNode(frame).quadraticCoefficients(frame, variable);
  };

  node.polynomialEvalStrings = function (frame, variable, arg) {
    return this.getEquivalentNode(frame).polynomialEvalStrings(frame, variable, arg);
  };

  node.toString = function () {
    return this.as_function_node.toString();
  };
});

exports.FunctionDeclarationNode = P(ParseNode, function (node, _super) {
  node.init = function (identifier, args, expression) {
    _super.init.call(this);
    this.assigns = identifier;
    this.referenceSymbol(this.assigns.identifier);
    this.args = args;
    this.arity = this.args.length;
    this.expression = expression;
    this.passed_variables = this.args.map(function (arg) {return arg.identifier});
    var possible_dependencies = this.expression.dependencies();
    for (var id in possible_dependencies) {
      if(!possible_dependencies.hasOwnProperty(id)) {continue;}

      var arity = possible_dependencies[id];
      if(this.passed_variables.indexOf(id) >= 0) {
        //Identifier is shadowed by arguments.  Make sure it's ok being a variable
        if(arity > 1) {throw("Cannot call argument " + id + " as a function")}
        //Otherwise, don't need to do anything.  It's shadowed, so it's not a dependency
      }
      else{
        //Not shadowed - becomes a dependency
        this.addDependency(id, arity);
      }
    }
  };
  node.statementType = FUNCTION_DEFINITION;
  node.exportDefinitionsTo = function (frame, compiler) {
    var self = this;
    /*
    frame.setFunction(self.assigns.identifier, self.args.length, function (args, f) {
        var shadow_frame = EvalFrame(frame)
        for (var i = 0; i < self.args.length; i++) {
          shadow_frame.setVariable(self.args[i].identifier, ConstantNode(args[i]));
        }
        return self.expression.evaluateOnce(shadow_frame);
      });
    */
    var evalStrings = self.expression.getEvalStrings(frame);
    var function_source = evalStrings.statements + "return " + evalStrings.expression;
    var function_args = self.args.map(function (a) {return a.identifier});
    var fn = compiler.compile(function_args, function_source);
    frame.setFunction(self.assigns.identifier, self.args.length, fn, self, function_args, function_source);
  };

  node.passedVariables = function () {
    return this.passed_variables; //TODO - deleteme
  };

  node.evaluateOnce = function (frame) {
    return "Defines function " + this.assigns.identifier;
  };

  node.getEvalStrings = function (frame) {
    return this.expression.getEvalStrings(frame);
  };

  node.toString = function () {
    return this.assigns + '\\left(' + this.args.join(', ') + '\\right)' +
      ' = ' + this.expression;
  };
});

var DerivativeNode = exports.DerivativeNode = P(ParseNode, function (node, _super) {
  node.init = function (variable, expression) {
    _super.init.call(this);
    this.derivative_variable = variable;
    this.expression = expression;
    this.addDependencies(expression.dependencies());
    this.addDependency(variable.identifier, 0);
  };

  node.evaluateOnce = function (frame) {
    var variable = this.derivative_variable;
    var dtree = this.expression.takeDerivative(frame, variable);

    if (!(dtree instanceof DerivativeNode)) {
      return dtree.evaluateOnce(frame);
    }

    var center_point = frame.getVariable(variable.identifier).evaluateOnce(frame);
    var local_frame = EvalFrame(frame);
    var epsilon = 5e-5;

    //Evaluate slightly below
    local_frame.setVariable(variable.identifier, ConstantNode(center_point - epsilon));
    var val0 = this.expression.evaluateOnce(local_frame);
    //Evaluate slightly above
    local_frame.setVariable(variable.identifier, ConstantNode(center_point + epsilon));
    var val1 = this.expression.evaluateOnce(local_frame);
    //Divide by dx and return
    return (val1 - val0) / (2 * epsilon);
  };

  node.getEvalStrings = function (frame) {
    var variable = this.derivative_variable;
    var dtree = this.expression.takeDerivative(frame, variable);

    if (!(dtree instanceof DerivativeNode)) {
      return dtree.getEvalStrings(frame);
    }

    var derivative = this.tmp();
    var variable_value = this.tmp();
    var epsilon = '(5e-5)';
    var high_value = this.tmp();
    var low_value = this.tmp();

    //Get and store value of the differentiation variable
    var variable_value_strings = variable.getEvalStrings(frame);
    var initialize = variable_value_strings.statements + 'var '+variable_value+'='+variable_value_strings.expression+';';

    //Compile expression
    var expression_strings = this.expression.getEvalStrings(frame);

    var sample_low  = variable.identifier+'='+variable_value+'-'+epsilon+';'+
                      expression_strings.statements+
                      'var '+low_value+'='+expression_strings.expression+';';

    var sample_high = variable.identifier+'='+variable_value+'+'+epsilon+';'+
                      expression_strings.statements+
                      'var '+high_value+'='+expression_strings.expression+';';

    //Compute the derivative from that
    var divide = 'var '+derivative+'=('+high_value+'-'+low_value+')/(2*'+epsilon+');';

    //Reset the value of the initial variable, in case someone was using it
    var cleanup = variable.identifier+'='+variable_value+';';

    var statements = initialize + sample_low + sample_high + divide + cleanup;
    return {expression:derivative, statements:statements};
  };

  node.toString = function () {
    return '\\frac{d}{d' + this.derivative_variable +  '}' +
      '\\left(' + this.expression + '\\right)';
  };
});

var RepeatedOperatorNode = exports.RepeatedOperatorNode = P(ParseNode, function (node, _super) {
  node.init = function (index, lower_bound, upper_bound, summand) {
    _super.init.call(this);
    this.index = index;
    this.lower_bound = lower_bound;
    this.upper_bound = upper_bound;
    this.summand = summand;
    this.addDependencies(this.lower_bound.dependencies());
    this.addDependencies(this.upper_bound.dependencies());
    this.addDependencies(this.summand.dependencies());
    this.shadowVariable(this.index.identifier); //TODO - make sure we're tracking this the same we we track assignments
  };

  node.evaluateOnce = function (frame) {
    var local_frame = EvalFrame(frame);
    var lower = Math.round(this.lower_bound.evaluateOnce(frame));
    var upper = Math.round(this.upper_bound.evaluateOnce(frame));
    var total = this.starting_value;
    if(!isFinite(upper - lower)) {
      total = (upper < lower ? this.starting_value : NaN);
    }
    else{
      for (var i = lower; i <= upper; i++) {
        local_frame.setVariable(this.index.identifier, ConstantNode(i));
        total = this.fn(total, this.summand.evaluateOnce(local_frame)); //Addition or multiplication
      }
    }
    return total;
  };

  node.getEvalStrings = function (frame) {
    var sum = this.tmp();
    var index = this.index.identifier;
    var lower_bound = this.tmp();
    var upper_bound = this.tmp();

    var lower_bound_strings = this.lower_bound.getEvalStrings(frame);
    var upper_bound_strings = this.upper_bound.getEvalStrings(frame);
    var summand_strings = this.summand.getEvalStrings(frame);

    var set_lower_bound = lower_bound_strings.statements + 'var '+lower_bound+' = Math.round(' + lower_bound_strings.expression + ');';
    var set_upper_bound = upper_bound_strings.statements + 'var '+upper_bound+' = Math.round(' + upper_bound_strings.expression + ');';
    var initialize_sum = 'var '+sum+'='+this.starting_value+';';
    var loop = 'for (var '+index+'='+lower_bound+';'+index+'<='+upper_bound+';'+index+'++) {'+summand_strings.statements+sum+this.in_place_operator+summand_strings.expression+'};';
   
    var protected_loop = 'if(!isFinite('+upper_bound+'-'+lower_bound+')) {'+sum+'=('+upper_bound+'<'+lower_bound+'?'+this.starting_value+':NaN);}else{'+loop+'}';

    return {expression:sum, statements:set_lower_bound + set_upper_bound + initialize_sum + protected_loop};
  };

});

exports.SummationNode = P(RepeatedOperatorNode, function (node, _super) {
  node.init = function (index, lower_bound, upper_bound, summand) {
    _super.init.call(this, index, lower_bound, upper_bound, summand);
  };

  node.starting_value = 0;
  node.in_place_operator = '+=';
  node.fn = function (a, b) {return a + b;};
  
  node.toString = function () {
    return '\\sum_{' + this.index + '=' + this.lower_bound + '}' +
      '^{' + this.upper_bound + '} ' + this.summand;
  };
});

exports.ProductNode = P(RepeatedOperatorNode, function (node, _super) {
  node.init = function (index, lower_bound, upper_bound, summand) {
    _super.init.call(this, index, lower_bound, upper_bound, summand);
  };

  node.starting_value = 1;
  node.in_place_operator = '*=';
  node.fn = function (a, b) {return a * b;};
  
  node.toString = function () {
    return '\\prod_{' + this.index + '=' + this.lower_bound + '}' +
      '^{' + this.upper_bound + '} ' + this.summand;
  };
});

exports.OrderedPairListNode = P(ParseNode, function (node, _super) {
  node.init = function (elements) {
    _super.init.call(this);
    this.elements = elements;

    for (var i = 0; i < elements.length; i++) {
      this.addDependencies(elements[i].dependencies());
    }
  };

  node.evaluateOnce = function (frame) {
    return this.elements.map(function (x) {return x.evaluateOnce(frame)});
  };

  node.getEvalStrings = function (frame) {
    var statements = '';
    var expression = '[';
    for (var i = 0; i < this.elements.length; i++) {
      var element_strings = this.elements[i].getEvalStrings(frame);
      statements += element_strings.statements;
      expression += element_strings.expression;
      if(i < this.elements.length - 1) this.expression += ',';
    }
    expression += ']';
    return {statements: statements, expression:expression};
  };

  node.toString = function () {
    return '\\left(' + this.elements.join(', ') + '\\right)';
  };

  node.statementType = ORDERED_PAIR_LIST;
});

//Copy all ParseNodes from exports onto yy.latex
for (var node in exports) {
  if(exports.hasOwnProperty(node)) latex.yy[node] = exports[node];
}

/* This function takes the entire function declaration as a single lexed token and parses with a regexp,
 * to keep the overall grammar context-free and LALR(1)-parseable.
 * TODO - generate this once, not every time we parse a function declaration */
latex.yy.parseFunctionDeclaration = function (declaration_string) {
  declaration_string = declaration_string.replace('###', '');  //Strip off start-of-line marker
  var whitespace_pattern =  //Non-capturing latex whitespace pattern
     "(?:\\s|\\\\space|\\\\\\:)*";
     //   \s   \\space  \\ \ :
  var id_body_pattern = //Non-capturing latex identifier pattern
     "(?:[a-zA-Z]|\\\\[a-zA-Z]+)";
  var id_subscript_pattern = //Non-capturing latex subscript pattern
     "(?:_[a-zA-Z0-9]|_{[a-zA-Z0-9]+})?";
  var id_pattern = id_body_pattern+id_subscript_pattern;

  var arglist_pattern = //Non-capturing comma-separated list of identifiers in whitespace-free string
    "(?:" + id_pattern + "(?:\\," + id_pattern + ")*)";

  var declaration_pattern = //Captures function name as first group, and arglist as second group
    "(" + id_pattern + ")" + "(?:\\\\left)?\\((" + arglist_pattern + ")(?:\\\\right)?\\)=";

  var declaration_regexp = new RegExp(declaration_pattern);
  var whitespace_regexp = new RegExp(whitespace_pattern, "g"); //Want "g" flag to ensure global capturing of whitespace
  declaration_string = declaration_string.replace(whitespace_regexp, '');
  var match = declaration_regexp.exec(declaration_string);

  return {
    identifier: IdentifierNode(match[1]),
    args: match[2].split(',').map(IdentifierNode), //match[1] is the argument list.  Split it on commas, and create an IdentifierNode from each one
    input_string: declaration_string.split('=')[0]        //input_string is used for constructing function tables.  We want to strip the equality off the end
  };
};

//This code over-rides latex.parse with a version that prepends a line-start marker
exports.parse = function (input) {
  return latex.parse("###"+input);
};

exports.tryParse = function (input) {
  try{
    var tree = exports.parse(input);
    return tree;
  }
  catch(e) {
    return ErrorNode(e);
  }
};

latex.yy.setInput = function (node, range) {
  node.setInputString(latex.yy.lexer.matched.slice(Math.max(3, range.first_column), range.last_column)); //Don't ever show the '###' mark we insert to mark the start of the string
};

latex.yy.parseError = function (err, hash) {
  throw("Sorry - I don't understand this");
};

return exports;
});

define('math/quadratic',['require'],function(require){

var Quadratic = {
  formula: function(coeffs, rootNumber){
    if (coeffs.length != 3) throw 'Where did you learn the quadratic formula?';
    var a = coeffs[0];
    var b = coeffs[1];
    var c = coeffs[2];

    if(a === 0){
      return [-c/b, -c/b];  //Linear case
    }

    var radical = Math.sqrt(b * b - 4 * a * c);
    var root0 = (-b + radical) / (2 * a);
    var root1 = (-b - radical) / (2 * a);

    //Optional argument rootNumber specifies which root to return.  If not specified, returns list of all roots
    if(rootNumber === 0) return root0;
    if(rootNumber === 1) return root1;
    return [root0, root1];
  },

  // For a quadratic inequality of the form a*x^2 + b*x + c > 0, returns
  // regions for which the inequality is satisfied in the form [ lower, mid0,
  // mid1, upper ]. The inequality is satisfied for:
  //
  //   x < lower ||
  //   (x > mid0 && x < mid1) ||
  //   x > upper
  //
  // Values can be NaN to signal that no inequality of the given type is
  // satisfied. At least two of the return values will always be NaN.
  inequalityRegions: function (coeffs) {
    // Would ideally like large === Infinity, but it's convenient to feed
    // these results through the line coalescing/jump detection/poi finding
    // pipeline, and none of that is set up to deal with Infinity correctly.
    var large = 1e305;

    var a = coeffs[0];
    var b = coeffs[1];
    var c = coeffs[2];

    if (a === 0 && b === 0) {
      return (c > 0) ?
        [ NaN, -large, large, NaN ] :
        [ NaN, NaN, NaN, NaN ]
      ;
    }
    if (a === 0) {
      return (b > 0) ?
        [ NaN, NaN, NaN, -c/b ] :
        [ -c/b, NaN, NaN, NaN ]
      ;
    }
    var discriminant = Math.sqrt(b*b - 4*a*c);
    if (!isFinite(discriminant)) {
      return (a > 0) ?
        [ NaN, -large, large, NaN ] :
        [ NaN, NaN, NaN, NaN ];
  
    }
    var upper = (-b + discriminant)/(2*a);
    var lower = (-b - discriminant)/(2*a);
    return (a > 0) ?
      [ lower, NaN, NaN, upper ] :
      [ NaN, upper, lower, NaN ] // upper/lower switched because a < 0
    ;
  },

  formulaEvalStrings: function(strings){
    var function_1, function_2;
    switch(strings.expressions.length){
    case 2:
      function_1 = strings.statements + 'return ' + '-' +strings.expressions[0] + '/' + strings.expressions[1];
      return [function_1];
    case 3:
      var statements =
        strings.statements +
        'var coeffs = [' + strings.expressions[2] + ',' +
                           strings.expressions[1] + ',' +
                           strings.expressions[0] + '];';
      function_1 = statements + 'return this.quadraticFormula(coeffs, 0);';
      function_2 = statements + 'return this.quadraticFormula(coeffs, 1);';
      return [function_1, function_2];
    }
  },

  inequalityRegionEvalStrings: function (strings) {
    // Prepend zeros onto coefficient strings that are too short.
    var expressions = strings.expressions.slice();
    while (expressions.length < 3) expressions.push('0');
    
    var statements = strings.statements +
      'var coeffs = [' + expressions[2] + ',' +
                         expressions[1] + ',' +
                         expressions[0] + '];';
    // TODO, send in correct operator
    return [
      statements + 'return this.quadraticInequalityRegions(coeffs)[0]',
      statements + 'return this.quadraticInequalityRegions(coeffs)[1]',
      statements + 'return this.quadraticInequalityRegions(coeffs)[2]',
      statements + 'return this.quadraticInequalityRegions(coeffs)[3]'
    ];
  }
};

return Quadratic;
});

//Definition of built-in functions and variables

define('math/builtinframe',['require','./builtin','./evalframe','./parser_util','./inverses','math/quadratic'],function(require){
  var BuiltIn = require('./builtin');
  var EvalFrame = require('./evalframe');
  var Parser = require('./parser_util');
  var inverses = require('./inverses');
  var Quadratic = require('math/quadratic');

  var ConstantNode = Parser.ConstantNode;

  var frame = EvalFrame();

  frame.setVariable('pi', ConstantNode(Math.PI));
  frame.setEvalStrings('pi', {expression:String(Math.PI), statements:''});
  frame.setVariable('tau', ConstantNode(2*Math.PI));
  frame.setEvalStrings('tau', {expression:String(2*Math.PI), statements:''});
  frame.setVariable('e', ConstantNode(Math.E));
  frame.setEvalStrings('e', {expression:String(Math.E), statements:''});

  // angleMultiplier function is defined for use in trig derivatives. It would
  // be nice to just make this a constant, but making it a function allows us
  // to avoid the possibility of conflicting with a user symbol. We don't have
  // arity 0 functions, so make it an arity 1 function that ignores its 
  // argument.
  frame.setDegreeMode = function (on) {
    frame._angleMultiplier = (on ? Math.PI/180 : 1);
  };

  frame.setDegreeMode(false);

  frame.setFunction('angleMultiplier', 1, function () {
    return frame._angleMultiplier;
  });

  //Trig functions
  //
  //Helper function
  var registerTrig = function(name, fn, fn_inverse) {
    frame.setFunction(name, 1, function (x) {
      return fn(x*frame._angleMultiplier);
    });
    frame.setFunction(inverses[name], 1, function (x) {
      return fn_inverse(x)/frame._angleMultiplier;
    });
  };
  //Use helper to register forward and inverse
  registerTrig('sin', BuiltIn.sin, Math.asin);
  registerTrig('cos', BuiltIn.cos, Math.acos);
  registerTrig('tan', BuiltIn.tan, Math.atan);
  registerTrig('cot', BuiltIn.cot, BuiltIn.acot);
  registerTrig('sec', BuiltIn.sec, BuiltIn.asec);
  registerTrig('csc', BuiltIn.csc, BuiltIn.acsc);

  //Hyperbolic trig functions
  //
  //Helper function
  var registerHyperbolicTrig = function(name, fn, fn_inverse){
    frame.setFunction(name, 1, fn);
    frame.setFunction(inverses[name], 1, fn_inverse);
  };
  //Use helper to register forward and inverse
  registerHyperbolicTrig('sinh', BuiltIn.sinh, BuiltIn.asinh);
  registerHyperbolicTrig('cosh', BuiltIn.cosh, BuiltIn.acosh);
  registerHyperbolicTrig('tanh', BuiltIn.tanh, BuiltIn.atanh);
  registerHyperbolicTrig('coth', BuiltIn.coth, BuiltIn.acoth);
  registerHyperbolicTrig('sech', BuiltIn.sech, BuiltIn.asech);
  registerHyperbolicTrig('csch', BuiltIn.csch, BuiltIn.acsch);

  frame.setFunction('pow', 2, BuiltIn.pow);
  frame.setFunction('sqrt', 1, Math.sqrt);
  frame.setFunction('nthroot', 2, BuiltIn.nthroot);
  frame.setFunction('log', 2, BuiltIn.log_base);
  frame.setFunction('exp', 1, Math.exp);
 
  frame.setFunction('floor', 1, Math.floor);
  frame.setFunction('ceil', 1, Math.ceil);
  frame.setFunction('round', 1, Math.round);
  frame.setFunction('abs', 1, Math.abs);
  frame.setFunction('mod', 2, BuiltIn.mod);
  frame.setFunction('max', 2, BuiltIn.max);
  frame.setFunction('min', 2, BuiltIn.min);
  frame.setFunction('sign', 1, BuiltIn.sign);

  frame.setFunction('lcm', 2, BuiltIn.lcm);
  frame.setFunction('gcd', 2, BuiltIn.gcd);

  frame.setFunction('nCr', 2, BuiltIn.nCr);
  frame.setFunction('nPr', 2, BuiltIn.nPr);
  frame.setFunction('factorial', 1, BuiltIn.factorial);
  frame.setFunction('polyGamma', 2, BuiltIn.polyGamma);

  frame.setFunction('quadraticFormula', 2, Quadratic.formula);
  frame.setFunction('quadraticInequalityRegions', 1, Quadratic.inequalityRegions);

  return frame;
});

define('lib/clone',['require'],function(require){
  var clone = function (json) {
    return JSON.parse(JSON.stringify(json));
  };
  return clone;
});

// There are a few ways we can define the configuration.
define('config',['require','lib/clone'],function(require) {
  /*global Desmos*/
  var clone = require('lib/clone');
  
  var config = {};
  
  // 1) Read from Desmos.config if it exists
  if (typeof Desmos !== 'undefined' && Desmos.config) {
    config = clone(Desmos.config);
  }
  
  // 2) Read from url if it specifies a desmos_config
  var re = new RegExp('desmos_config=([^&]+)');
  var match = location.search.match(re);
  if (match !== null) {
    config = JSON.parse(decodeURIComponent(match[1]));
  }
  
  return {
    
    get: function (prop) {
      return config[prop];
    },
    
    use: function (props, func) {
      // save a copy of the config
      var configOriginal = clone(config);
      
      // copy over the temporary changes
      for (var prop in props) {
        config[prop] = props[prop];
      }
      
      // run the function and reset config afterwards
      try {
        func();
      } finally {
        config = configOriginal;
      }
    },
    
    all: function () {
      return clone(config);
    }
    
  };
});

define('math/plotter',['require','./distance','./poi','graphing/graphmode','./builtinframe','config'],function(require){
  /* jshint maxlen: false */
  var Distance = require('./distance');
  var POI = require('./poi');
  var GRAPHMODE = require('graphing/graphmode');
  var BuiltInFrame = require('./builtinframe');
  var Config = require('config');

var Plotter = {

  //Accumulates a list of segments
  Accumulator: function (domain) {
    var xtolerance, ytolerance;
    
    if (domain) {
      xtolerance = domain.xtolerance || domain.tolerance || 0;
      ytolerance = domain.ytolerance || domain.tolerance || 0;
    } else {
      xtolerance = ytolerance = 0;
    }
    
    var colinear = function (p0, p1, p2, xtolerance, ytolerance) {
      
      if (domain && domain.map) {
        p0 = domain.map(p0);
        p1 = domain.map(p1);
        p2 = domain.map(p2);
      }
      
      var t = Distance.pointToSegmentParameter(
        p2[0], p2[1],
        p0[0], p0[1],
        p1[0], p1[1]
      );

      if (t < 1) return false;

      var closestPoint = [
        p0[0] + t*(p1[0] - p0[0]),
        p0[1] + t*(p1[1] - p0[1])
      ];

      return (
        Math.abs(p2[0] - closestPoint[0]) <= xtolerance &&
        Math.abs(p2[1] - closestPoint[1]) <= ytolerance
      );
    };
    
    return {
      xtolerance: xtolerance,
      ytolerance: ytolerance,
      segments:[],
      segment:null,

      // Second point added to colinear set; defines line direction
      pivotPoint: null,
      // Most recent point in colinear set
      pendingPoint: null,

      addPoint: function (p) {
        this.n+=1;
        var pivotPoint = this.pivotPoint;

        if (!this.segment) {
          this.segment = [p[0], p[1]];  //First point of the segment
          return;
        }

        if (xtolerance < 0 && ytolerance < 0) {
          this.segment.push(p[0], p[1]);
          return;
        }
 
        if (!pivotPoint) {
          this.pivotPoint = p;
          this.pendingPoint = p;
          return;
        }

        // Check if the new point lies on the line segment defined by the
        // last flushed point and the pivot point. If not, flush the pending
        // point and start a new linear section.
        var lastPoint = [
          this.segment[this.segment.length - 2],
          this.segment[this.segment.length - 1]
        ];

        if (!colinear(lastPoint, pivotPoint, p, xtolerance, ytolerance)) {
          this.flushPending();
          this.pivotPoint = p;
        }

        this.pendingPoint = p;
      },

      flushPending: function () {
        if (this.pendingPoint) { //Only happens when we have a segment
          this.segment.push(this.pendingPoint[0], this.pendingPoint[1]);
          this.pivotPoint = null;
          this.pendingPoint = null;
        }
      },
 
      breakSegment: function () {
        this.flushPending();

        if (this.segment) {
          if (this.segment.length > 2) {
            this.segments.push(this.segment);
          }
          this.segment = null;
        }
      },

      getSegments: function () {
        this.breakSegment();
        return this.segments;
      }
    };
  },

//Simple sampling of a [x(t), y(t)] function.
//Domain is provided in terms of the independent variable
//PARAMETERS
//fn(int) => [x, y]
//domain = {min, max, step}
//RETURNS
//Unclipped list of segments which can be passed directly into onGraph
  sampleParametricNaive: function(fn, domain){
    var accumulator = Plotter.Accumulator();
    var point;
    for(var independent = domain.min; independent <= domain.max + domain.step/2; independent += domain.step){
      point = fn(independent);
      if (isFinite(point[0]) && isFinite(point[1])){
        accumulator.addPoint(point);
      }
      else{
        accumulator.breakSegment();
      }
    }
    return accumulator.getSegments();
  },

  //Simple sampling of a y(x) function.
  //PARAMETERS
  //fn(int) => y
  //domain = {min, max, step}
  //RETURNS
  //Unclipped list of segments which can be passed directly into onGraph
  sampleXYNaive: function (fn, domain) {
    var accumulator = Plotter.Accumulator(domain);
    var y;
    for (var x = domain.min; x <= domain.max + domain.step/2; x += domain.step) {
      y = fn(x);
      if (isFinite(y)) {
        accumulator.addPoint([x, y]);
      } else {
        accumulator.breakSegment();
      }
    }
    return accumulator.getSegments();
  },

  sampleXY: function(fn, domain) {
    
    var accumulator = Plotter.Accumulator(domain);
    var edge;
    var x = domain.min;
    var y = fn(x);
    var previousPoint = [x, y];
    var jumpTolerance;
    
    if (domain) jumpTolerance = domain.ytolerance || domain.tolerance;
    
    var handleJump = function (previousPoint, point) {
      if (!isFinite(jumpTolerance) || (jumpTolerance <= 0)) return;
      var jump;
      var xc;
      xc = Distance.mean(previousPoint[0], point[0]);
      jump = POI.bisectJump(
        previousPoint[0], previousPoint[1],
        xc, fn(xc),
        point[0], point[1],
        fn, jumpTolerance
      );
      if (jump) {
        accumulator.addPoint(jump[0]);
        accumulator.breakSegment();
        accumulator.addPoint(jump[1]);
      }
    };
    
    if (isFinite(y)) accumulator.addPoint([x, y]);
    for (x += domain.step; x <= domain.max + domain.step/2; x += domain.step) {
      y = fn(x);
      if (isFinite(y) && isFinite(previousPoint[1])) {
        handleJump(previousPoint, [x, y]);
        accumulator.addPoint([x, y]);
      } else if (isFinite(y) && !isFinite(previousPoint[1])) {
        // left edge
        edge = POI.bisectFinite(previousPoint[0], previousPoint[1], x, y, fn);
        if (edge[0] !== x) accumulator.addPoint(edge);
        handleJump(edge, [x, y]);
        accumulator.addPoint([x, y]);
      } else if (!isFinite(y) && isFinite(previousPoint[1])) {
        // right edge
        edge = POI.bisectFinite(previousPoint[0], previousPoint[1], x, y, fn);
        handleJump(previousPoint, edge);
        if (edge[0] !== previousPoint[0]) accumulator.addPoint(edge);
        accumulator.breakSegment();
      }
      previousPoint = [x, y];
    }
    return accumulator.getSegments();
  },

  findPiPeriod: function (fn, domain, allowAntiperiods) {
    // If the function is periodic by a multiple of 2*pi, or antiperiodic by
    // a multiple of pi within the domain, return the period.
    //
    // Can optionally pass true to find antiperiods if they exist.
    var min = domain.min;
    var range = domain.max - domain.min;
    var tolerance = (domain.xtolerance && domain.ytolerance) ?
      Math.min(domain.xtolerance, domain.ytolerance) :
      domain.tolerance;
    var piRange = Math.floor(range/(Math.PI/BuiltInFrame._angleMultiplier));
    var n, m, period;

    function isPeriod(fn, n) {
      var sign = (n % 2 === 0) ? 1 : -1;
      if (!allowAntiperiods && sign === -1) return false;
      var nPI = n*(Math.PI/BuiltInFrame._angleMultiplier);
      var vals = [ min, min + 1, min + 2, min + 3];
      
      for (var i = 0, ilen = vals.length; i < ilen; i++) {
        if (
          isFinite(fn(vals[i])) !== isFinite(fn(vals[i] + nPI)) ||
          Math.abs(fn(vals[i]) - sign*fn(vals[i] + nPI)) > tolerance
        ) {
          return false;
        }
      }
      
      return true;
    }

    for (n = 1; n <= piRange; n++) {
      if (isPeriod(fn, n)) {
        period = n;
        // Check if integer multiples of the period are also periods
        for (m = 2; m*n <= piRange; m++) {
          if (!isPeriod(fn, m*n)) period = undefined;
        }
        if (period) break;
      }
    }
    
    if (!period) return null;
    
    return period*(Math.PI/BuiltInFrame._angleMultiplier);
  },

  mapPolar: function (p) {
    return [ p[1]*Math.cos(p[0]), p[1]*Math.sin(p[0]) ];
  },

  samplePolar: function (fn, domain) {
    // Don't allow line coallescing, since linear segments of a polar
    // equation don't map to lines on the graph paper.
    domain.map = this.mapPolar;
    return this.sampleXY(fn, domain);
  },

  // Helper for calling a function at steps along a range that makes sure we
  // hit start and endpoints exactly.
  //
  // TODO, use this in sampling xy also. Not
  // doing that for now because I don't want to step on Eric's toes with
  // extrema interleaving system that is being concurrently developed.
  eachStep: function (domain, fn) {
    var min = domain.min;
    var max = domain.max;
    var step = domain.step;
    var range = max - min;
    var nsteps = Math.ceil(range/step);
    var newStep = range/nsteps;
    for (var n = 0; n < nsteps; n++) {
      fn(min + n*newStep);
    }
    fn(max);
  },

  sampleParametricRecursive: function(fn, domain){
    if(domain.max < domain.min){ return [] }

    var accumulator = Plotter.Accumulator(domain);
    var xtolerance, ytolerance;
    if (domain) {
      xtolerance = domain.xtolerance || domain.tolerance || 0;
      ytolerance = domain.ytolerance || domain.tolerance || 0;
    } else {
      xtolerance = ytolerance = 0;
    }

    //Sampling parameters
    var subdivision_levels = 10;

    //Initialize for first pass through loop
    var t0 = domain.min;
    var p0 = fn(t0);
    if (isFinite(p0[0]) && isFinite(p0[1])){
      accumulator.addPoint(p0);
    }

    var p1;
    // Note, processes first point twice; but that's okay.
    this.eachStep(domain, function (t1) {
      p1 = fn(t1);
      Plotter.subsampleParametricRecursive(fn, t0, p0, t1, p1, subdivision_levels, accumulator, xtolerance, ytolerance);
      t0 = t1;
      p0 = p1;
    });

    return accumulator.getSegments();
  },

  subsampleParametricRecursive: function(fn, t0, p0, t1, p1, subdivision_levels_left, accumulator, xtolerance, ytolerance){

    if (t1 === t0) return; // Nothing new to add, but don't need to break;

    var t_mid = Distance.mean(t0, t1);
    var p_mid = fn(t_mid, true);

    var p0_valid = isFinite(p0[0]) && isFinite(p0[1]);
    var p1_valid = isFinite(p1[0]) && isFinite(p1[1]);
    var p_mid_valid = isFinite(p_mid[0]) && isFinite(p_mid[1]);

    if (subdivision_levels_left === 0 || t_mid === t0 || t_mid === t1) {
      accumulator.breakSegment(); //Didn't converge.
      if (p1_valid) accumulator.addPoint(p1);
      return;
    }

    if (!p0_valid && !p1_valid) return; //Don't need to break segment, since p0 should already have been processed.

    if(p0_valid != p1_valid){
      //We're at the edge of where the function is defined.  Subdivide until we find where edge point to machine precision
      var original_t0 = t0;
      var original_t1 = t1;
      var original_p0 = p0;
      var original_p1 = p1;
   
      while (t0 !== t_mid && t_mid !== t1) {

        if(p_mid_valid == p0_valid){
          t0 = t_mid;
          p0 = p_mid;
          p0_valid = p_mid_valid;
        }
        else{
          t1 = t_mid;
          p1 = p_mid;
          p1_valid = p_mid_valid;
        }

        t_mid = t0 + (t1-t0)/2;
        p_mid = fn(t_mid, true);
        p_mid_valid = isFinite(p_mid[0]) && isFinite(p_mid[1]);
      } //When this loop terminates, t_mid equals either t0 or t1

      if(p0_valid){
        Plotter.subsampleParametricRecursive(fn, original_t0, original_p0, t0, p0, subdivision_levels_left-1, accumulator, xtolerance, ytolerance);
        accumulator.breakSegment();
      }
      else{
        accumulator.breakSegment();
        accumulator.addPoint(p1);
        Plotter.subsampleParametricRecursive(fn, t1, p1, original_t1, original_p1, subdivision_levels_left-1, accumulator, xtolerance, ytolerance);
      }
      return;
    }

    if (p0_valid && p_mid_valid && p1_valid) {
      
      var t = Distance.pointToSegmentParameter(
        p_mid[0],
        p_mid[1],
        p0[0],
        p0[1],
        p1[0],
        p1[1]
      );
      
      // If the new point lies betwen 20 % and 80 % of the way between the
      // outer points, and the distance from the segment to the new point is
      // less than tolerance, add the rightmost point, and stop recursing.
      if (
        t > 0.2 &&
        t < 0.8 &&
        Math.abs(p_mid[0] - (p0[0] + t*(p1[0] - p0[0]))) <= xtolerance &&
        Math.abs(p_mid[1] - (p0[1] + t*(p1[1] - p0[1]))) <= ytolerance
      ) {
        accumulator.addPoint(p1);
        return;
      }
    }

    // If we didn't stop, recurse. Don't recurse between two points that are
    // equal, since this will make us do a lot of work if our point becomes
    // independent of t over some range.
    if (!(p0[0] === p_mid[0] && p0[1] === p_mid[1])) {
      Plotter.subsampleParametricRecursive(fn, t0, p0, t_mid, p_mid, subdivision_levels_left - 1, accumulator, xtolerance, ytolerance);
    }
    if (!(p1[0] === p_mid[0] && p1[1] === p_mid[1])) {
      Plotter.subsampleParametricRecursive(fn, t_mid, p_mid, t1, p1, subdivision_levels_left - 1, accumulator, xtolerance, ytolerance);
    }
  },

  validateViewState: function(viewState){
    /*jshint -W018*/ //Suppresses !(a>b) jshint warning.
    if(!viewState) return false;
    var xmin = viewState.viewport.xmin;
    var xmax = viewState.viewport.xmax;
    var ymin = viewState.viewport.ymin;
    var ymax = viewState.viewport.ymax;
    if(!(xmax > xmin)) return false;
    if(!(ymax > ymin)) return false;
    if(!(viewState.screen.width > 0)) return false;
    if(!(viewState.screen.height > 0)) return false;
    return true;
  },

  computeDomain: function(viewState, graph_info, fn){
    var xmin = viewState.viewport.xmin;
    var xmax = viewState.viewport.xmax;
    var ymin = viewState.viewport.ymin;
    var ymax = viewState.viewport.ymax;

    var oversample = viewState.oversample || 4;
    var xtolerance = 1/oversample*(xmax - xmin)/viewState.screen.width;
    var ytolerance = 1/oversample*(ymax - ymin)/viewState.screen.height;
    var isLinear = graph_info.isLinear;

    var domain;
    switch(graph_info.graphMode){
      case GRAPHMODE.X:
        domain = {
          min: ymin,
          max: ymax,
          xtolerance: ytolerance, // Note, switched
          ytolerance: xtolerance,
          step: (isLinear ? ymax - ymin : ytolerance)
        };
        break;
      case GRAPHMODE.Y:
        domain = {
         min: xmin,
         max: xmax,
         xtolerance: xtolerance,
         ytolerance: ytolerance,
         step: (isLinear ? xmax - xmin : xtolerance)
        };
        break;
      case GRAPHMODE.POLAR:
        domain = {
          min :0,
          max: 2*Math.PI/BuiltInFrame._angleMultiplier*6,
          step: (2*Math.PI/BuiltInFrame._angleMultiplier)/1000,
          tolerance: Math.min(xtolerance, ytolerance)
        };
        var period = Plotter.findPiPeriod(fn, domain, graph_info.operator === '=');
        if (period) domain.max = domain.min + period;
        break;
      case GRAPHMODE.PARAMETRIC:
        domain = {
          min: graph_info.domain.min,
          max: graph_info.domain.max,
          step: graph_info.domain.step,
          xtolerance: xtolerance,
          ytolerance: ytolerance
        };
        break;
    }
    return domain;
  },

  classifyBranchConic: function (segments) {
    if (!Config.get('conic')) return;
    var conic, segmentConic;
    if (segments.length === 1 && segments[0].length === 4) return 'line';
    for (var i = 0; i < segments.length; i++) {
      var segment = segments[i];
      var len = segment.length;
      if (len < 12) return 'unknown';
      try {
        segmentConic = Distance.classifyConic(
          segment[0], segment[1],
          segment[2*Math.floor(1*len/12)], segment[2*Math.floor(1*len/12) + 1],
          segment[2*Math.floor(2*len/12)], segment[2*Math.floor(2*len/12) + 1],
          segment[2*Math.floor(3*len/12)], segment[2*Math.floor(3*len/12) + 1],
          segment[2*Math.floor(4*len/12)], segment[2*Math.floor(4*len/12) + 1],
          segment[len - 2], segment[len - 1]
        );
      } catch (e) {
        // numeric.js's SVD routine can fail to converge and throw an error.
        return 'unknown';
      }
      
      if (segmentConic === 'none') return 'none';
      if (conic && segmentConic !== conic) return 'none';
      conic = segmentConic;
    }
    return conic;
  },

  //Computes domain, decides what function to use, and returns answer
  computeGraphData: function(viewState, graph_info, fn){
    var domain = Plotter.computeDomain(viewState, graph_info, fn);
    if(!domain) return [];
    var segments;
    var tmp;
    switch(graph_info.graphMode){
      case GRAPHMODE.X:
      case GRAPHMODE.Y:
      segments = Plotter.sampleXY(fn, domain);
      break;
      case GRAPHMODE.POLAR:
      segments = Plotter.samplePolar(fn, domain);
      break;
      case GRAPHMODE.PARAMETRIC:
      if(!domain.step) domain.step = (domain.max - domain.min) / 1000;
      segments = Plotter.sampleParametricRecursive(fn, domain);
    }

    var poi = [];
    if(graph_info.graphMode !== GRAPHMODE.PARAMETRIC){
      poi = POI.findPOIs(segments, fn);
      segments = Plotter.interleaveExtrema(segments, poi);
    }

    // Flip POI representation if necessary
    if (graph_info.graphMode === GRAPHMODE.X) {
      for (var type in poi) {
        if (!poi.hasOwnProperty(type)) continue;
        tmp = poi[type].y;
        poi[type].y = poi[type].x;
        poi[type].x = tmp;
      }
    }

    var datum = {
      segments: segments,
      graphMode: graph_info.graphMode,
      color: graph_info.color,
      style: graph_info.style,
      operator: graph_info.operator,
      poi: poi,
      conic: Plotter.classifyBranchConic(segments),
      expr: null //compiled.fn
    };
    return [datum];
  },

  interleaveExtrema: function(segments, poi) {
    var nsegments = segments.length;
    var segment;
    var newSegments = Array(nsegments);
    var newSegment;
    var slen;
    var extrema = poi.extrema;
    var j=0;
    var elen = extrema.x.length;

    for (var n = 0; n < nsegments; n++) {
      segment = segments[n];
      slen = segment.length;
      newSegment = [];
      for (var i=0; i < slen; i = i+2) {
        // push extrema between last point and current point onto
        // accumulator.
        while (j < elen && extrema.x[j] <= segment[i]) {
          // Don't push the same point twice
          if (extrema.x[j] !== segment[i]) {
            newSegment.push(extrema.x[j], extrema.y[j]);
          }
          j++;
        }
        // push current point onto accumulator.
        newSegment.push(segment[i], segment[i+1]);
      }
      newSegments[n] = newSegment;
    }
    return newSegments;
  },

  polygonsFromSegments: function(bottom_segments, top_segments, graphMode){
    var last_x = function(segments){
      var last_segment = segments[segments.length - 1];
      return last_segment[last_segment.length - 2];
    };

    var polygons = [];
    //Until we have pulled the last segment:
      //Continue to pull segments from the top and the bottom until we find two which end at the same point.
      //When that happens, close the polygon, and start another one.
    var i_top = 0;
    var i_bottom = 0;
    var current_bottom = [];
    var current_top = [];
    var top_x = -Infinity;
    var bottom_x = -Infinity;

    while(true){

      if(top_x <= bottom_x){
        if(i_top >= top_segments.length) break;
        current_top.push(top_segments[i_top++]);
      }
      if(bottom_x <= top_x){
        if(i_bottom >= bottom_segments.length) break;
        current_bottom.push(bottom_segments[i_bottom++]);
      }
      top_x = last_x(current_top);
      bottom_x = last_x(current_bottom);

      if(top_x == bottom_x){
        polygons.push(Plotter.polygonFromSegments(current_bottom, current_top, graphMode));
        current_top = [];
        current_bottom = [];
      }
    }
    return polygons;
  },

  polygonFromSegments: function(bottom_segments, top_segments, graphMode){
    //TODO - respect graphMode (by pushing in proper order)
    var i, j, p, segment;
    var polygon = [];
    var map;
    switch(graphMode){
      case GRAPHMODE.POLAR:
        map = this.mapPolar;
        break;
      case GRAPHMODE.X:
        map = function(p){return [p[1], p[0]];};
        break;
    }
    for(i = 0; i < bottom_segments.length; i++){
      segment = bottom_segments[i];
      for(j = 0; j < segment.length; j += 2){
        p = [segment[j], segment[j+1]];
        if(map)
          p = map(p);
        polygon.push(p[0], p[1]);
      }
    }
    for(i = top_segments.length - 1; i>=0; i--){
      segment = top_segments[i];
      for(j = segment.length - 2; j >= 0; j -= 2){
        p = [segment[j], segment[j+1]];
        if(map)
          p = map(p);
        polygon.push(p[0], p[1]);
      }
    }
    return polygon;
  }
};

return Plotter;
});

define('main/fake_i18n',['require','underscore'],function (require) {
  // This file fakes i18n for places where i18n isn't yet working correctly
  // For example: in the webworker when generating error messages
  var _ = require('underscore');

  //example usage:
  //i18n.t("Too many free variables to graph.  Try defining '__variable__.", {variable: free_variables[i]});

  var translate = function (str, options) {
    _.each(options, function(option, key) {
      str = str.split('__' + key + '__').join(option);
    });
    return str;
  };

  var init = function () {};

  return {
    t: translate,
    init: init
  };
});
// Basically temporary shim to support the API of the current formula object and allow integration into the rest of the
// system. API here is just a direct copy, funny naming and all.

define('math/evaluationstate',['require','pjs','graphing/graphmode','math/comparators'],function(require){
  var P = require('pjs');
  var GRAPHMODE = require('graphing/graphmode');
  var Comparators = require('math/comparators');

var EvaluationState = P(function (state) {
  state.init = function (analysis, context, statement) {
    var graphMode;
    

    this.error = analysis.error;
    this.is_graphable = statement && statement.isGraphable();
    
    if (this.is_graphable) graphMode = analysis.graph_info.graphMode;
    this.is_evaluable = statement && statement.isEvaluable();
    if (this.is_evaluable) this.zero_values = statement.getZeroValues();
    this.is_point_list = graphMode === GRAPHMODE.XYPOINT || graphMode === GRAPHMODE.XYPOINT_MOVABLE;
    this.is_parametric = graphMode === GRAPHMODE.PARAMETRIC;
    this.is_shade_between = this.is_graphable && !!statement.shade_between;
    if (this.is_shade_between) this.shade_between_operators = statement.getOperators();
    this.is_double_inequality = this.is_shade_between && statement.getOperators().length == 2;
    if (statement) {
      this.operator = statement.getOperator();
      this.assignment = statement.getAssignedVariable();
      this.variables = statement.getSlidableVariables();
      this.simple_constant = statement.getSliderValue();
      this.is_inequality = this.is_double_inequality || Comparators.table[this.operator].direction !== 0;
    } else {
      this.variables = [];
    }
    //Internally true or undefined, nicer to pass true/false to others
    this.is_slidable = !!analysis.slider;
    this.is_animatable = this.is_slidable && !this.is_graphable;
    if (analysis.moveIds) {
      this.move_ids = analysis.moveIds;
    }
    this.is_tableable = (
      this.is_graphable &&
      !this.is_parametric &&
      !statement.is_solved_equation &&
      this.operator === '=' &&
      !this.is_double_inequality
    );
    if (this.is_tableable) {
      this.table_info = statement.getTableInfo();
      var independent = this.table_info.independent_variable;
      if(independent === 'y' || independent === 'theta') {
        this.is_tableable = false;
        delete(this.table_info);
      }
    }
  };
});
return EvaluationState;
});

define('graphing/columnmode',{
  POINTS: 'POINTS',
  LINES: 'LINES',
  POINTS_AND_LINES: 'POINTS_AND_LINES'
});

define('math/derivative',['require','./parser_util','./evalframe'],function(require){
  var Parser = require('./parser_util');
  var EvalFrame = require('./evalframe');

var DerivativeNode = Parser.DerivativeNode;
var ConstantNode = Parser.ConstantNode;
var NegationNode = Parser.NegationNode;
var ParseNode = Parser.ParseNode;
var BinaryOperatorNode = Parser.BinaryOperatorNode;
var FunctionNode = Parser.FunctionNode;
var FunctionDeclarationNode = Parser.FunctionDeclarationNode;
var FunctionCallExponentNode = Parser.FunctionCallExponentNode;
var IdentifierNode = Parser.IdentifierNode;
var RepeatedOperatorNode = Parser.RepeatedOperatorNode;
var SummationNode = Parser.SummationNode;
var ChainedComparatorNode = Parser.ChainedComparatorNode;
var PiecewiseNode = Parser.PiecewiseNode;
var AssignmentNode = Parser.AssignmentNode;
// TODO derivative not defined for AssignmentNode and ProductNode
// var ProductNode = Parser.ProductNode;

DerivativeNode.open(function (node) {
  node.takeDerivative = function (frame, variable) {
    if (this.freeOf(frame, variable)) return ConstantNode(0);
    
    var dtree = this.expression.takeDerivative(
      frame,
      this.derivative_variable
    );

    // If root of the derivative tree is a Derivative node, then we don't know
    // how to symbolically differentiate this tree. Just wrap it in another
    // DerivativeNode.
    if (dtree instanceof DerivativeNode) {
      return Parser.DerivativeNode(variable, dtree);
    }

    return dtree.takeDerivative(frame, variable);
  };
  
  node.freeOf = function (frame, variable) {
    return this.expression.freeOf(frame, variable);
  };
  
  node.substitute = function (frame) {
    var dtree = this.expression.takeDerivative(
      frame,
      this.derivative_variable
    );

    if (dtree instanceof DerivativeNode) {
      if (frame.hasVariable(this.derivative_variable.identifier)) {
        throw "Can't substitute for derivative variable if derivative can't be taken symbolically";
      }

      return DerivativeNode(this.derivative_variable, this.expression);
    }

    return dtree.substitute(frame);
  };
});

ParseNode.open(function (node) {
  // Fallback. If we don't know how to take the derivative of a node
  // symbolically, wrap it in a DerivativeNode, and the evaluator will
  // evaluate the derivative numerically.
  node.takeDerivative = function (frame, variable) {
    return DerivativeNode(variable, this);
  };

  node.freeOf = function (frame, variable) { return false; };
});

var DerivativeHelpers = {};

// Helper for implementing the chain rule. For f(a), tree is f'(a), and
// arg is a. Returns f'(a)*da/dx, but checks whether a is free of x, in which
// case we just return a ConstantNode(0). This is important when f'(a) is
// undefined, since 0*NaN is NaN, but we want the output to be zero.
DerivativeHelpers.chain = function(frame, variable, tree, arg) {
  if (arg.freeOf(frame, variable)) return ConstantNode(0);
  return BinaryOperatorNode.reduce(
    '*',
    tree,
    arg.takeDerivative(frame, variable)
  );
};

// Helper that parses a latex string and returns a function that replaces
// a_{i} identifiers with the trees in an array. e.g.
//
//   substituteFn('a_1*\\sin(a_0)')([Parser.parse('x^2'), Parser.parse('y')])
//
// returns a tree equivalent to
//
//   Parser.parse('y*\\sin(x^2)')
;(function () {

  var tmps = [];
  var argRegExps = [];

  // 9 arguments should be enough for anyone...
  for (var i = 0; i < 9; i++) {
    tmps.push(IdentifierNode('a_{' + i + ParseNode.prototype.tmp() + '}'));
    argRegExps.push(RegExp('a_' + i, 'g'));
  }

  // Do things lexically like this because the latexStrings are known
  // statically, and because we don't yet have all the substitute machinery
  // defined.
  //
  // Note, this code is a little more delicate than it looks. the tmps could
  // almost be straight strings, but I'm making them IdentifierNodes and using
  // .toString and .identifier to finesse the issue that a_{i} parses into an
  // expression with identifier a_i.
  var replaceArgs = function (latexString) {
    for (var i = 0; i < tmps.length; i++) {
      latexString = latexString.replace(argRegExps[i], tmps[i].toString());
    }
    return latexString;
  };

  DerivativeHelpers.substituteFn = function(latexString) {
    var parsed = Parser.parse(replaceArgs(latexString));
    var frame = EvalFrame();
    
    return function (args) {
      var length = args.length;
      for (var i = 0; i < length; i++) {
        frame.setVariable(tmps[i].identifier, args[i]);
      }
      return parsed.substitute(frame);
    };
  };
})();


// Factory method for creating binary operator nodes that folds constants.
// Note, we don't simplify 0*a because a could be NaN or Infinity.
BinaryOperatorNode.reduce = function (operator, arg1, arg2) {
  switch (operator) {
    case '+':
      if (arg1 instanceof ConstantNode && arg2 instanceof ConstantNode) {
        return ConstantNode(arg1.value + arg2.value);
      }
      if (arg1 instanceof ConstantNode && arg1.value === 0) {
        return arg2;
      }
      if (arg2 instanceof ConstantNode && arg2.value === 0) {
        return arg1;
      }
      break;
    case '-':
      if (arg1 instanceof ConstantNode && arg2 instanceof ConstantNode) {
        return ConstantNode(arg1.value - arg2.value);
      }
      if (arg2 instanceof ConstantNode && arg2.value === 0) {
        return arg1;
      }
      break;
    case '*':
      if (arg1 instanceof ConstantNode && arg2 instanceof ConstantNode) {
        return ConstantNode(arg1.value*arg2.value);
      }
      if (arg1 instanceof ConstantNode && arg1.value === 1) {
        return arg2;
      }
      if (arg2 instanceof ConstantNode && arg2.value === 1) {
        return arg1;
      }
      break;
    case '/':
      if (arg2 instanceof ConstantNode && arg2.value === 1 ) {
        return arg1;
      }
      if (arg1 instanceof ConstantNode && arg2 instanceof ConstantNode) {
        return ConstantNode(arg1/arg2);
      }
      break;
    case '^':
      if (arg2 instanceof ConstantNode && arg2.value === 1) {
        return arg1;
      }
      break;
  }
  return BinaryOperatorNode(operator, arg1, arg2);
};

NegationNode.reduce = function (expression) {
  if (expression instanceof ConstantNode) {
    return ConstantNode(-expression.value);
  }
  if (expression instanceof NegationNode) return expression.expression;
  return NegationNode(expression);
};

BinaryOperatorNode.open(function (node, _super) {
  
  // substitution functions for taking derivatives of powers:
  // d/dxf(x)^{g(x)} = g(x)*f(x)^{g(x) - 1}*f'(x) + f(x)^{g(x)}*ln(f(x))*g'(x)
  //                =         bprime*f'(x)        +         eprime*g'(x)
  var bprime = DerivativeHelpers.substituteFn('a_1*a_0^{a_1 - 1}');
  var eprime = DerivativeHelpers.substituteFn('a_0^{a_1}*\\ln(a_0)');
  
  node.takeDerivative = function (frame, variable) {
    if (this.freeOf(frame, variable)) return ConstantNode(0);
    
    var a0 = this.args[0];
    var a1 = this.args[1];
    switch (this.operator) {
      case '+':
        return BinaryOperatorNode.reduce(
          '+',
          a0.takeDerivative(frame, variable),
          a1.takeDerivative(frame, variable)
        );
      case '-':
        return BinaryOperatorNode.reduce(
          '-',
          a0.takeDerivative(frame, variable),
          a1.takeDerivative(frame, variable)
        );
      case '*':
        return BinaryOperatorNode.reduce(
          '+',
          DerivativeHelpers.chain(frame, variable, a1, a0),
          DerivativeHelpers.chain(frame, variable, a0, a1)
        );
      case '/':
        return BinaryOperatorNode.reduce(
          '/',
          BinaryOperatorNode.reduce(
            '-',
            DerivativeHelpers.chain(frame, variable, a1, a0),
            DerivativeHelpers.chain(frame, variable, a0, a1)
          ),
          BinaryOperatorNode.reduce('^', a1, ConstantNode(2))
        );
      case '^':
        return BinaryOperatorNode.reduce(
          '+',
          DerivativeHelpers.chain(frame, variable, bprime(this.args), a0),
          DerivativeHelpers.chain(frame, variable, eprime(this.args), a1)
        );
      default:
        return _super.takeDerivative.call(this, frame, variable);
    }
  };
  
  node.freeOf = function (frame, variable) {
    return this.args[0].freeOf(frame, variable) &&
      this.args[1].freeOf(frame, variable);
  };

  node.substitute = function (frame) {
    return BinaryOperatorNode.reduce(
      this.operator,
      this.args[0].substitute(frame),
      this.args[1].substitute(frame)
    );
  };
});

ChainedComparatorNode.open(function (node) {
  node.freeOf = function (frame, variable) {
    return this.args.every(function (arg) {
      return arg.freeOf(frame, variable);
    });
  };
  
  node.substitute = function (frame) {
    return ChainedComparatorNode(
      this.comparators,
      this.args.map(function(arg) {
        return arg.substitute(frame);
      })
    );
  };
});

ConstantNode.open(function (node) {
  node.takeDerivative = function () { return ConstantNode(0); };

  node.freeOf = function (frame, variable) { return true; };

  node.substitute = function (frame) { return this; };
});

FunctionNode.open(function (node, _super) {
  var derivativeStrings = {
    exp: [ '\\exp(a_0)' ],
    sqrt: [ '\\frac{1}{2*\\sqrt{a_0}}' ],
    sin: [ '\\angleMultiplier(1)*\\cos(a_0)' ],
    cos: [ '-\\angleMultiplier(1)*\\sin(a_0)' ],
    tan: [ '\\angleMultiplier(1)*(\\sec(a_0))^2' ],
    arcsin: [ '\\frac{1}{\\angleMultiplier(1)*\\sqrt{1 - a_0^2}}' ],
    arccos: [ '\\frac{-1}{\\angleMultiplier(1)*\\sqrt{1 - a_0^2}}' ],
    arctan: [ '\\frac{1}{\\angleMultiplier(1)*(1 + a_0^2)}' ],
    sinh: [ '\\cosh(a_0)' ],
    cosh: [ '\\sinh(a_0)' ],
    tanh: [ '(\\sech(a_0))^2' ],
    arcsinh: [ '\\frac{1}{\\sqrt{a_0^2 + 1}}' ],
    arccosh: [ '\\frac{1}{\\sqrt{a_0^2 - 1}}' ],
    arctanh: [ '\\frac{1}{1 - a_0^2}' ],
    factorial: [ '(a_0)!*\\polyGamma(0, a_0 + 1)' ],
    floor: [ '\\left\\{ \\mod(a_0, 1) > 0: 0 \\right\\}' ],
    ceil: [ '\\left\\{ \\mod(a_0, 1) > 0: 0 \\right\\}' ],
    round: [
      '\\left\\{ \\abs(\\mod(a_0, 1) - 0.5) > 0: 0 \\right\\}'
    ],
    abs: [ '\\left\\{ \\abs(a_0) > 0: \\sign(a_0) \\right\\}' ],
    sign: [ '\\left\\{ \\abs(a_0) > 0: 0 \\right\\}' ],
    angleMultiplier: [ '0' ],
    log: [
      // d/dx ln(x) is actually real for negative x, too, but showing the
      // derivative in places where we don't show the function is confusing,
      // so restrict to x > 0.
      '\\left\\{a_0 > 0: \\frac{1}{a_0*\\ln(a_1)}\\right\\}',
      '\\frac{-\\log_{a_1}(a_0)}{a_1*\\ln(a_1)}'
    ],
    pow: [
      'a_1*a_0^{a_1 - 1}',
      'a_0^{a_1}*\\ln(a_0)'
    ],
    nthroot: [
      'a_0^{1/a_1 - 1}/a_1',
      '-\\frac{a_0^{1/a_1}*\\ln(a_0)}{a_1^2}'
    ],
    polyGamma: [
      '0/0',
      '\\polyGamma(1 + a_0, a_1)'
    ],
    // Taking care to leave the derivative undefined for min(x, c) when x == c
    // Not sure how to make the case of d/dx min(x, x) = 1 work right
    min: [
      '\\left\\{ a_0 < a_1 : 1, a_0 > a_1 : 0 \\right\\}',
      '\\left\\{ a_1 < a_0 : 1, a_1 > a_0 : 0 \\right\\}'
    ],
    max: [
      '\\left\\{ a_0 > a_1 : 1, a_0 < a_1 : 0 \\right\\}',
      '\\left\\{ a_1 > a_0 : 1, a_1 < a_0 : 0 \\right\\}'
    ],
    mod: [
      '\\left\\{ \\abs(\\mod(a_0, a_1)) > 0: 1 \\right\\}',
      // Check whether division results in an integer directly instead
      // of computing mod of the args because division sometimes results
      // in an integer when modulus does not result in 0, e.g.
      //
      // 3.8 % -0.7599999999999999 -> 3.3306690738754696e-16, but
      // 3.8 / -0.7599999999999999 -> -5
      //
      // This can confuse the jump detector, resulting in spurious
      // connections.
      //
      //TODO still have some spurious connections near 0 in d/dx mod(3,x).
      // Why?
      '\\left\\{ \\mod(a_0/a_1, 1) > 0: -\\floor(a_0/a_1) \\right\\}'
    ]
  };
  
  var derivativeTable = {};
  
  // Turn derivativeStrings into substitution functions by mapping
  // substituteFn. Extra scope is to keep 'identifier' from leaking.
  ;(function () {
    var ds = derivativeStrings;
    var dt = derivativeTable;
    var substituteFn = DerivativeHelpers.substituteFn;
    for (var identifier in ds) {
      if (!ds.hasOwnProperty(identifier)) continue;
      dt[identifier] = ds[identifier].map(substituteFn);
    }
  })();

  var registerReciprocalDerivative = function (symbol, reciprocal) {
    derivativeTable[reciprocal] = [function (args) {
      return NegationNode.reduce(BinaryOperatorNode.reduce(
        '/',
        derivativeTable[symbol][0](args),
        BinaryOperatorNode.reduce(
          '^',
          FunctionNode(IdentifierNode(symbol), args),
          ConstantNode(2)
        )
      ));
    }];
  };

  [
    ['sin', 'csc'],
    ['cos', 'sec'],
    ['tan', 'cot'],
    ['sinh', 'csch'],
    ['cosh', 'sech'],
    ['tanh', 'coth']
  ].forEach(function(pair) {
    registerReciprocalDerivative(pair[0], pair[1]);
  });

  var registerInverseReciprocalDerivative = function (symbol, reciprocal) {
    derivativeTable[reciprocal] = [function (args) {
      return NegationNode.reduce(BinaryOperatorNode.reduce(
        '/',
        derivativeTable[symbol][0]([
          BinaryOperatorNode.reduce('/', ConstantNode(1), args[0])
        ]),
        BinaryOperatorNode.reduce('^', args[0], ConstantNode(2))
      ));
    }];
  };

  [
    ['arcsin', 'arccsc'],
    ['arccos', 'arcsec'],
    ['arctan', 'arccot'],
    ['arcsinh', 'arccsch'],
    ['arccosh', 'arcsech'],
    ['arctanh', 'arccoth']
  ].forEach(function(pair) {
    registerInverseReciprocalDerivative(pair[0], pair[1]);
  });

  var undefinedFn = function () { return ConstantNode(NaN); };

  // Assumes arity 2
  var registerUndefinedDerivative = function (symbol) {
    derivativeTable[symbol] = [ undefinedFn, undefinedFn ];
  };

  // We actually round arguments for these functions, so to be consistent,
  // these could be defined as 0 except at integers where they're undefined,
  // but that is not a standard definition.
  //
  // Can also define continuous nCr and nPr using gamma function.
  //
  //TODO useful error messages for these?
  ['lcm', 'gcd', 'nCr', 'nPr', 'mcm', 'mcd'].forEach(registerUndefinedDerivative);

  //These functions are used for solving quadratic functions, but will never be differentiated.
  //This is a bit of an abuse of the frame system, but registering them as builtins is a good way
  //to have them available within compiled functions
  ['quadraticFormula', 'quadraticInequalityRegions'].forEach(registerUndefinedDerivative);

  node.takeDerivative = function (frame, variable) {
    if (this.freeOf(frame, variable)) return ConstantNode(0);
    
    var identifier = this.identifier.identifier;

    var args = this.args;
    var partials;
    if (derivativeTable.hasOwnProperty(identifier)) {
      partials = derivativeTable[identifier];
    } else if (frame.hasFunction(identifier)) {
      partials = frame.getFunctionTree(identifier).computePartials(frame);
    } else if (this.args.length === 1 && frame.hasVariable(identifier)) {
      // Treat as implicit multiplication
      return BinaryOperatorNode(
        '*',
        this.identifier,
        this.args[0]
      ).takeDerivative(frame, variable);
    } else {
      return _super.takeDerivative.call(this, frame, variable);
    }

    var nargs = args.length;

    var firstTerm = DerivativeHelpers.chain(
      frame,
      variable,
      partials[nargs - 1](args),
      args[nargs - 1]
    );

    // Implements the chain rule for multi-argument functions. Called
    // recursively to build up a sum using BinaryOperatorNode('+', ...)
    function sumPartials(sumSoFar, n) {
      if (n < 0) return sumSoFar;

      return sumPartials(BinaryOperatorNode.reduce(
        '+',
        sumSoFar,
        DerivativeHelpers.chain(
          frame,
          variable,
          partials[n](args),
          args[n]
        )
      ), n - 1);
    }

    return sumPartials(firstTerm, this.args.length - 2);
  };
  
  node.freeOf = function (frame, variable) {
    return this.args.every(function (arg) {
      return arg.freeOf(frame, variable);
    }) && this.identifier.freeOf(frame, variable);
  };

  node.substitute = function (frame) {
    return FunctionNode(
      this.identifier,
      this.args.map(function (arg) {
        return arg.substitute(frame);
      })
    );
  };
});

FunctionDeclarationNode.open(function (node) {
  node.computePartials = function (frame) {
    var self = this;
    return self.args.map(function (arg) {
      var dtree = self.expression.takeDerivative(frame, arg);
      return function (args) {
        var argFrame = EvalFrame(frame);
        var valFrame = EvalFrame(frame);
        var tmp;
        for (var i = 0; i < self.args.length; i++) {
          tmp = IdentifierNode(self.tmp());
          argFrame.setVariable(self.args[i].identifier, tmp);
          valFrame.setVariable(tmp.identifier, args[i]);
        }
        // Use temporary identifiers to avoid putting self-referencing
        // substitutions in the same frame, i.e. x->2x, since substitute
        // works recursively.
        return dtree.substitute(argFrame).substitute(valFrame);
      };
    });
  };
});

FunctionCallExponentNode.open(function (node) {
  node.takeDerivative = function (frame, variable) {
    return this.getEquivalentNode(frame).takeDerivative(frame, variable);
  };
  
  node.freeOf = function (frame, variable) {
    return this.getEquivalentNode(frame).freeOf(frame, variable);
  };
  
  node.substitute = function (frame) {
    return FunctionCallExponentNode(
      this.identifier.substitute(frame),
      this.arg.substitute(frame),
      this.exponent.substitute(frame)
    );
  };
});

IdentifierNode.open(function (node) {
  node.takeDerivative = function (frame, variable) {
    if (variable.identifier === this.identifier) return ConstantNode(1);
    if (!frame.hasVariable(this.identifier)) return ConstantNode(0);
    return frame.getVariable(this.identifier).takeDerivative(frame, variable);
  };

  node.freeOf = function (frame, variable) {
    if (variable.identifier === this.identifier) return false;
    if (!frame.hasVariable(this.identifier)) return true;
    return frame.getVariable(this.identifier).freeOf(frame, variable);
  };
  
  node.substitute = function (frame) {
    if (!frame.hasVariable(this.identifier)) return this;
    
    return frame.getVariable(this.identifier).substitute(frame);
  };
  
});

NegationNode.open(function (node) {
  node.takeDerivative = function (frame, variable) {
    if (this.freeOf(frame, variable)) return ConstantNode(0);
    return NegationNode.reduce(this.expression.takeDerivative(frame, variable));
  };
  
  node.freeOf = function (frame, variable) {
    return this.expression.freeOf(frame, variable);
  };

  node.substitute = function (frame) {
    return NegationNode.reduce(this.expression.substitute(frame));
  };
});

PiecewiseNode.open(function (node) {
  //NOTE doesn't differentiate the condition (expect this to only produce
  // delta functions)
  node.takeDerivative = function (frame, variable) {
    if (this.freeOf(frame, variable)) return ConstantNode(0);
    
    var pn = PiecewiseNode(
      this.condition,
      this.if_expr.takeDerivative(frame, variable)
    );

    if (this.else_expr) {
      pn.append_else(this.else_expr.takeDerivative(frame, variable));
    }

    return pn;
  };

  //TODO ignores the condition for now. Only want to traverse nodes that
  // derivative traverses.
  node.freeOf = function (frame, variable) {
    if (!this.else_expr) {
      return (
        this.condition.freeOf(frame, variable) &&
        this.if_expr.freeOf(frame, variable)
      );
    }
    return (
      this.condition.freeOf(frame, variable) &&
      this.if_expr.freeOf(frame, variable) &&
      this.else_expr.freeOf(frame, variable)
    );
  };

  node.substitute = function (frame) {
    var pn = PiecewiseNode(
      this.condition.substitute(frame),
      this.if_expr.substitute(frame)
    );

    if (this.else_expr) pn.append_else(this.else_expr.substitute(frame));

    return pn;
  };
});

RepeatedOperatorNode.open(function (node) {
  node.freeOf = function (frame, variable) {
    return (
      this.index.freeOf(frame, variable) &&
      this.lower_bound.freeOf(frame, variable) &&
      this.upper_bound.freeOf(frame, variable) &&
      this.summand.freeOf(frame, variable)
    );
  };

  node.substitute = function (frame) {
    // If the index is in the substitution map, replace it before substituting
    //TODO is this necessary?
    var index = this.index;
    var newFrame = EvalFrame(frame);
    var newIndex;
    //Always replace index with new tmp variable, to prevent early collapsing
    newIndex = IdentifierNode(this.tmp());
    newFrame.setVariable(index.identifier, newIndex);
    
    // Note, can't call this.constructor(...) directly because it's a pjs
    // corner case. See https://github.com/jayferd/pjs/issues/9
    var constructor = this.constructor;
    return constructor(
      newIndex,
      this.lower_bound.substitute(frame),
      this.upper_bound.substitute(frame),
      this.summand.substitute(newFrame)
    );
  };
});

SummationNode.open(function (node) {
  node.takeDerivative = function (frame, variable) {
    if (this.freeOf(frame, variable)) return ConstantNode(0);
    
    return SummationNode(
      this.index,
      this.lower_bound,
      this.upper_bound,
      this.summand.takeDerivative(frame, variable)
    );
  };
});

//TODO ProductNode not implemented. The easy way to write this involves
// divisions of terms that could be zero
// node.takeDerivative = function (frame, variable)


// Nodes that can be graphed need to be able to return the derivative of
// the expression they graph for extremum finding. For example, if we have
// y = sin(x), the sin(x) part is graphed, so we need to be able to find the
// derivative of it.
//
// Call this 'expressionDerivative' instead of 'takeDerivative' because it
// isn't really the derivative of the whole node.
;(function () {
  var expressionDerivative = function (frame, variable) {
    return this.expression.takeDerivative(frame, variable);
  };
  
  AssignmentNode.open(function (node) {
    node.substitute = function (frame) {
      return AssignmentNode(this.assigns, this.expression.substitute(frame));
    };
    
    node.expressionDerivative = expressionDerivative;
  });

  FunctionDeclarationNode.open(function (node) {
    node.substitute = function (frame) {
      return FunctionDeclarationNode(this.assigns, this.args, this.expression.substitute(frame));
    };
    
    node.expressionDerivative = expressionDerivative;
  });
})();

return; //Just re-opens ParseNodes, doesn't return anything

});

define('math/evaluatorobject',['require','underscore','pjs','main/fake_i18n','./parser_util','./plotter','./comparators','./evalframe','./quadratic','./evaluationstate','graphing/graphmode','graphing/columnmode','./derivative'],function(require){
  /* jshint maxlen: false */
  var _ = require('underscore');
  var P = require('pjs');

  //in the worker, use our fake i18n for now,
  //which just proxies through the english translation
  var i18n = require('main/fake_i18n');

  var Parser = require('./parser_util');
  var Plotter = require('./plotter');
  var Comparators = require('./comparators');
  var EvalFrame = require('./evalframe');
  var Quadratic = require('./quadratic');
  var EvaluationState = require('./evaluationstate');
  var GRAPHMODE = require('graphing/graphmode');
  var COLUMNMODE = require('graphing/columnmode');
  require('./derivative');

  //Status enums
  var ERROR = {name: 'ERROR'};
  var WARNING = {name: 'WARNING'};
  var EVALUABLE = {name: 'EVALUABLE'};
  var GRAPHABLE = {name: 'GRAPHABLE'};
  var SILENT = {name: 'SILENT'};

  //TODO - need to export Nodes from parse_util into namespace
var AnalysisClass = {}; //Map object type to analysis class

var ConstantNode = Parser.ConstantNode;
var IdentifierNode = Parser.IdentifierNode;
var ErrorNode = Parser.ErrorNode;
var BinaryOperatorNode = Parser.BinaryOperatorNode;

function copyDefinedPOIs(points) {
  var xs = [];
  var ys = [];

  var len = points.length;
  for (var i=0; i<len; i++) {
    xs.push(points[i][0]);
    ys.push(points[i][1]);
  }

  return {
    defined: {x: xs, y: ys}
  };
}

var AnalysisObject = P(function(obj){
  obj.init = function(context){
    this._context = context;
    this._analysis = null;
    this.compiler = context.compiler;
  };

  obj.exportDefinitionsTo = function(frame){
  };

  obj.getAllIds = function(){
    return [];
  };

  obj.cleanupId = function(id){
    throw "base analysis object can't cleanup ID";
  };

  obj.invalidate = function(){
    this._analysis = null;
  };

  obj.getAnalysis = function(){
    if(!this._analysis) this._context.updateAnalysis();
    return this._analysis;
  };

  obj.setAnalysis = function(analysis){
    this._analysis = analysis;
  };

  obj.shouldIntersect = function(){
    return false;
  };

  obj.isEvaluable = function(){
    return this.getAnalysis().status == EVALUABLE;
  };

  obj.isGraphable = function(){
    return this.getAnalysis().status == GRAPHABLE;
  };

  obj.isGraphed = function(){
    return this.isGraphable();
  };

  obj.graphModeFromVariables = function(independent, dependent){
    if(dependent === 'x' || independent === 'y') return GRAPHMODE.X;
    if((dependent === 'r' && independent === 'theta') ||
       (dependent === 'r' && independent === undefined) ||
       (dependent === undefined && independent === 'theta')){
          return GRAPHMODE.POLAR;
    }
    return GRAPHMODE.Y;
  };


  obj.setGraphMode = function(mode, independent, dependent){

    if(dependent === 'y' && !independent) independent = 'x';
    if(dependent === 'x' && !independent) independent = 'y';
    if(dependent === 'r' && !independent) independent = 'theta';

    if(!mode){
      mode = this.graphModeFromVariables(independent, dependent);
    }
    this._analysis.graph_info = {
      color: this._statement.color,
      style: this._statement.style,
      graphMode:mode,
      independent:independent,
      dependent:dependent,
      operator: this.getOperator(),
      domain: this._statement.domain //Only defined for parametric.  One day for polar also
    };
    return GRAPHABLE;
  };

  obj.computeGraphData = function(viewport){
  };

  obj.getStatus = function(){
    return this.getAnalysis().status;
  };

  obj.getAssignedVariable = function(){
    return null;//TODO - override for variable definitions and equations
  };

  obj.compile = function(){
    return undefined;
  };

  obj.getSlidableVariables = function(){
    return [];
  };

  obj.getSliderValue = function(){
    return NaN;
  };

  obj.getZeroValues = function(){
    return [];
  };

  obj.addFreeVariables = function(variables){
    for(var i = 0; i < variables.length; i++){
      var variable = variables[i];
      if(this._analysis.free_variables.indexOf(variable) > -1) continue;
      this._analysis.free_variables.push(variable);
    }
  };

});

var StatementAnalysis = P(AnalysisObject, function(obj, _super){
  obj.init = function(context, statement, tree){
    _super.init.call(this, context);
    this._statement = statement;
    this._tree = tree;
    this.id = statement.id;
    //TODO - get rid of these copies.  They're here to make the transition easier
    this.color = statement.color;
    this.style = statement.style;
    this.domain = statement.domain;
  };

  obj.isGraphed = function(){
    return this.isGraphable() && this._statement.shouldGraph;
  };

  obj.getAllIds = function(){
    return [this.id];
  };

  obj.getGraphInfo = function(){
    return this._analysis.graph_info;
  };

  obj.shouldIntersect = function(){
    if(!this.isGraphed()) return false;
    var graphMode = this.getGraphInfo().graphMode;
    return (graphMode === GRAPHMODE.Y || graphMode === GRAPHMODE.X);
  };

  obj.computeGraphData = function(viewState){
    var graphData = {};

    //Compile
    var frame = this._context.getFrame();

    var compiled = this.compile(frame);
    compiled.fn.derivative = this.compileDerivative(frame).fn;

    //Figure out graphMode
    var graph_info = this._analysis.graph_info;
    //Check if it's linear first
    var order =  this._tree.polynomialOrder(frame, graph_info.independent);
    if(order === 1){
      graph_info.isLinear = true;
    }

    //Actually fill out graphData
    graphData[this.id] = Plotter.computeGraphData(viewState, graph_info, compiled.fn);
    graphData[this.id][0].compiled = compiled;
    return graphData;
  };

  obj.getEvaluationState = function(){
    return EvaluationState(this._analysis, this._context, this);
  };

  obj.computeStatus = function(){
    return this.markError(i18n.t("Unimplemented status check"));
  };

  obj.getZeroValues = function(){
    return [{val: this._tree.evaluateOnce(this._context.getFrame()), operator:'='}];
  };

  obj.referencesSymbol = function(symbol){
    return this._tree.references(symbol);
  };

  obj.referencedSymbols = function(symbol){
    return this._tree._referencedSymbols;
  };

  obj.getSlidableVariables = function(){
    var free_variables = this._analysis.free_variables;
    var variables = [];
    for(var i = 0; i < free_variables.length; i++){
      var variable = free_variables[i];
      if(this._context.assignmentForbidden(variable)) continue;
      if (this._analysis.hasOwnProperty('solution')) {
        if (variable == this._analysis.solution.variable) continue;
      }
      variables.push(variable);
    }
    return variables;
  };

  obj.exportedSymbols = function(){
    //assignment or function declaration
    var exported = {};
    if(this._tree.assigns)
      exported[this._tree.assigns.identifier] = this._tree.arity;
    return exported;
  };

  obj.exportDefinitionsTo = function (frame, id) {
    if(!this._tree.assigns) return;
    var symbol = this._tree.assigns.identifier;
    if(this._context.assignmentForbidden(symbol)) return;
    this._tree.exportDefinitionsTo(frame, this.compiler);
    // Used to look up which expression defines an identifier
    frame.setDefinitionId(symbol, id);
  };

  obj.shadowedSymbols = function(){
    return [];
  };

  obj.getDependencies = function(){
    return this._tree.dependencies();
  };

  obj.getType = function(){
    return this._tree.statementType;
  };

  obj.freeVariablesError = function(free_variables){
    for(var i = 0; i < free_variables.length; i++){
      if(this._context.assignmentForbidden(free_variables[i])) continue;
      var msg = i18n.t(
        "Too many free variables to graph.  Try defining '__variable__'",
        {variable: free_variables[i]}
      );
      return this.markError(msg);
    }
    return this.markError(i18n.t("Too many free variables.  I don't know what to do with this"));
  };

  obj.getParseError = function(){
    if(this._tree.valid) return undefined;
    return this._tree.error_msg;
  };

  obj.markError = function(msg){
    this._analysis.error = msg;
    this._analysis.status = ERROR;
    return ERROR;
  };

  obj.evaluateOnce = function(frame){
    return this._tree.evaluateOnce(frame);
  };

  obj.evalStrings = function(frame){
    return this._tree.getEvalStrings(frame);
  };

  obj.compileAllBranches = function(frame){
    return [this.compile(frame)];
  };

  obj.compile = function(frame) {
    var source = this.compile_to_strings(frame, this.independent_variable());
    source.fn = this.compiler.compile(source.args, source.function_string);
    return source;
  };

  obj.compileDerivative = function (frame) {
    var independent_variable = this.independent_variable();
    var identifier = IdentifierNode(independent_variable);
    var derivative_tree;
    if (this._tree.expressionDerivative) {
      derivative_tree = this._tree.expressionDerivative(frame, identifier);
    } else {
      derivative_tree = this._tree.takeDerivative(frame, identifier);
    }
    
    //TODO CLEANUP Making a new object like this is a bit of a hack. Consider
    // changing interface of compile functions so we don't need to pass as
    // much stuff.
    var derivativeObject = StatementAnalysis(
      this._context,
      this._statement,
      derivative_tree
    );
    var source = derivativeObject.compile_to_strings(frame,
      independent_variable);
    source.fn = this.compiler.compile(source.args, source.function_string);
    return source;
  };

  obj.independent_variable = function () {
    if (this._analysis.status === GRAPHABLE) {
      return this._analysis.graph_info.independent;
    } else if (this._analysis.free_variables.length === 1) {
      return this._analysis.free_variables[0];
    }
  };

  obj.compile_to_strings = function(frame, independent_variable) {
    var eval_strings = this._tree.getEvalStrings(frame);

    var function_string = eval_strings.statements + 'return ' + eval_strings.expression;
    return {
      args: [independent_variable],
      function_string: function_string
    };
  };

  obj.getOperator = function(){
    return '=';
  };

  obj.getTableInfo = function(){
    return undefined;
  };

  obj.getTableInfo = function(){
    return {
      independent_variable: this._analysis.graph_info.independent,
      dependent_column: this._tree.getInputString(),
      by_reference: false
    };
  };

});

AnalysisClass[EXPRESSION] = P(StatementAnalysis, function(obj, _super){
  obj.computeStatus = function(frame){
    var free_variables = this._analysis.free_variables;
    if(free_variables.length === 0) return EVALUABLE;
    if(free_variables.length === 1){
      switch(free_variables[0]){
      case 'x':     return this.setGraphMode(GRAPHMODE.Y, 'x');
      case 'y':     return this.markError(i18n.t("Maybe you wanted to plot x as a function of y?"));
      case 'r':     //Fall through to theta
      case 'theta': return this.markError(i18n.t("Maybe you wanted to plot r as a function of θ?"));
      default:      return this.markError(i18n.t("Maybe you wanted to plot x or y as a function of __variable__ ?",{variable:free_variables[0]}));
      }
    }
    return this.freeVariablesError(free_variables);
  };
});

AnalysisClass[FUNCTION_DEFINITION] = P(StatementAnalysis, function(obj, _super){
  obj.init = function(context, statement, tree){
    _super.init.call(this, context, statement, tree);
    this.arity = this._tree.arity;
  };

  obj.shadowedSymbols = function(){
    return this._tree.passed_variables;
  };

  obj.computeStatus = function(frame){
    if(this._tree.arity === 1){
      if(this._tree.assigns.identifier === this._tree.passed_variables[0]){
        return this.markError(i18n.t("You can't use __identifier__ as both the function name and the argument", this._tree.assigns.identifier));
      }
      if(this._analysis.free_variables.length > 0){ //f(x) = a with a undefined shouldn't plot vs. a
        return this.markError(i18n.t("Every variable you use in the function must be defined.  Either define __variable__or pass it in as an argument", {variable:this._analysis.free_variables[0]}));
      }
      return this.setGraphMode(undefined, this._tree.passed_variables[0], this._tree.assigns.identifier);
    }
    if(this._tree.arity > 1) return WARNING; //TODO - need to handle these warnings in the UI
  };

  obj.addFreeVariables = function(variables){
    var passed_variables = this._tree.passedVariables();
    for(var i = 0; i < variables.length; i++){
      var variable = variables[i];
      if(passed_variables.indexOf(variable) > -1) continue;
      if(this._analysis.free_variables.indexOf(variable) > -1) continue;
      this.markError(i18n.t("Every variable you use in the function must be defined.  Either define '__variable__' or pass it in as an argument", {variable: variable}));
      this._analysis.free_variables.push(variable);
    }
  };

  obj.conflictError = function(symbol){
    var msg = i18n.t("'__symbol__' is already defined, so you can\'t reuse it as one of the parameters of this function", {symbol: symbol});
    return this.markError(msg);
  };

  obj.getTableInfo = function(){
    if(this._context.assignmentForbidden(this._tree.assigns.identifier)){
      return {
        independent_variable: this._analysis.graph_info.independent,
        dependent_column: this._tree.expression.getInputString(),
        by_reference: false
      };
    } else {
      return {
        independent_variable: this._analysis.graph_info.independent,
        dependent_column: this._tree.getInputString(),
        by_reference: true
      };
    }
  };

  obj.getSlidableVariables = function(){
    var free_variables = this._analysis.free_variables;
    var variables = [];
    for(var i = 0; i < free_variables.length; i++){
      var variable = free_variables[i];
      if(this._context.assignmentForbidden(variable)) continue;
      variables.push(variable);
    }
    return variables;
  };

});


AnalysisClass[VARIABLE_DEFINITION] = P(StatementAnalysis, function(obj, _super){
  obj.computeStatus = function(frame){
    var variable = this._tree.assigns.identifier;
    var free_variables = this._analysis.free_variables;
    if (variable === 'theta') {
    //TODO - support this
      return this.markError(i18n.t("Sorry - can't graph θ as a function of anything yet"));
    }
    if (free_variables.length === 0) {
      var should_slide = (this._tree.expression instanceof ConstantNode);
      if(should_slide) this._analysis.slider = true;

      if ('xyr'.indexOf(variable) !== -1) return this.setGraphMode(undefined, undefined, variable);
      return should_slide ? SILENT : EVALUABLE;  //Don't display the value next to a slider
    }
    if (free_variables.length === 1) {
      if(free_variables[0] === variable) {
      //TODO - needs better message (at least)
        return this.markError(i18n.t('Cannot define __variable__ in terms of itself.'), {variable: free_variables[0]});
      }
      if (free_variables[0] === 'r') {
        return this.markError(i18n.t('Maybe you wanted to plot r as a function of θ?'));
      }
      return this.setGraphMode(undefined, free_variables[0], variable);
    }
    return this.freeVariablesError(free_variables);
  };

  obj.getAssignedVariable = function(){
    return this._tree.assigns.identifier;
  };

  obj.getSliderValue = function(){
    if(this._tree.expression instanceof ConstantNode){
      return this._tree.evaluateOnce();
    }
    return _super.getSliderValue();
  };

  obj.getTableInfo = function(){
    if(this._context.assignmentForbidden(this._tree.assigns.identifier)){
      return {
        independent_variable: this._analysis.graph_info.independent,
        dependent_column: this._tree.expression.getInputString(),
        by_reference: false
      };
    } else {
      return {
        independent_variable: this._analysis.graph_info.independent,
        dependent_column: this._analysis.graph_info.dependent,
        by_reference: true
      };
    }
  };
});

AnalysisClass[IDENTIFIER]= P(StatementAnalysis, function(obj, _super){
  obj.computeStatus = function(frame){
    var free_variables = this._analysis.free_variables;
    if(free_variables.length === 1 && free_variables[0] === 'x') return this.setGraphMode(GRAPHMODE.Y, 'x');
    if(free_variables.length > 0) return SILENT;
    return EVALUABLE;
  };
});

AnalysisClass[CONSTANT]= P(StatementAnalysis, function(obj, _super){
  obj.computeStatus = function(frame){
    return SILENT;
  };

  obj.getSliderValue = function(){
    return this._tree.evaluateOnce();
  };
});

AnalysisClass[ORDERED_PAIR_LIST]= P(StatementAnalysis, function(obj, _super){

  // A point is movable if one or both of its coordinates is an identifier
  // that has a slider associated with it.
  //
  // With this definition:
  //
  // [ 'a = 1', 'b = 1', '(a, b)' ]     can be dragged in both directions
  //
  // [ 'a = 1', 'b = 1', '(a, b + 1)' ] can be dragged horizontally only
  //
  // [ 'a = 1', '(a, a^2)' ]            updates 'a' when dragged, which moves
  //                                    the point along a parabola
  //
  // [ 'a = 1', '(a + 1, a^2)' ]        can't be dragged at all
  //
  obj.computeMovable = function (frame) {
    var self = this;
    if (self._analysis.status != GRAPHABLE) return; //Filter out errors and depdendency problems
    if (self._analysis.free_variables.length !== 0) return;
    if (self._tree.elements.length !== 1) return;
    var movable;
    var moveIds = [undefined, undefined];
    self._tree.elements[0].children.forEach(function (tree, index) {
      if (!(tree instanceof IdentifierNode)) return;

      var definitionId = frame.getDefinitionId(tree.identifier);
      if (definitionId === undefined) return;
      if (!self._context.statements[definitionId]._analysis.slider) return;
      
      movable = true;
      moveIds[index] = definitionId;
    });

    if (movable) {
      self._analysis.movable = true;
            
      // upgrade a point to a movable point
      if (self._analysis.graph_info.graphMode === GRAPHMODE.XYPOINT) {
        self._analysis.graph_info.graphMode = GRAPHMODE.XYPOINT_MOVABLE;
      }
      
      // Avoid double updating in case of [ 'a = 1', '(a, a)' ]
      if (moveIds[1] === moveIds[0]) moveIds[1] = undefined;
      self._analysis.moveIds = moveIds;
    }
  };

  obj.computeStatus = function(frame){
    var free_variables = this._analysis.free_variables;
    if(free_variables.length === 0){
      return this.setGraphMode(GRAPHMODE.XYPOINT);
    }

    if(free_variables.length === 1){
      if(free_variables[0] === 't' && this._tree.elements.length == 1){
        return this.setGraphMode(GRAPHMODE.PARAMETRIC, 't');
      }
      return this.markError(i18n.t("Define '__variable__' to plot this point, or make each coordinate a function of 't' to plot it as a parametric function", {variable: free_variables[0]}));
    }

    if(free_variables.length > 1){
      return this.freeVariablesError(free_variables);
    }
  };

  obj.getSlidableVariables = function(){
    //Don't offer to create a slider for t
    var variables = _super.getSlidableVariables.call(this);
    var index = variables.indexOf('t');
    if(index > -1){
      variables.splice(index, 1);
    }
    return variables;
  };

  obj.computeGraphData = function(viewState){
    //Figure out graphMode
    var graph_info = this._analysis.graph_info;
    var graphData = {};

    //Test if we're points
    if(graph_info.graphMode === GRAPHMODE.XYPOINT || graph_info.graphMode === GRAPHMODE.XYPOINT_MOVABLE){
      var points = this._tree.evaluateOnce(this._context.getFrame());
      var datum = {
        segments: [points],
        graphMode: graph_info.graphMode,
        color: this._statement.color,
        style: this._statement.style,
        poi: copyDefinedPOIs(points)
      };
      graphData[this.id] = [datum];
      return graphData;
    }

    //Plot parametric
    
    //Compile
    var compiled = this.compile(this._context.getFrame());
    var fn = function(x){return compiled.fn(x)[0]};  //TODO - fix this with compileAllBranches
    graphData[this.id] = Plotter.computeGraphData(viewState, graph_info, fn);
    return graphData;
    //Start intersections going (TODO - make sure starting / stopping these is still correct)
  };

  obj.getTableInfo = function(){
    var values = this._tree.evaluateOnce(this._context.getFrame());
    return {
      independent_variable: 'x',
      dependent_column: 'y',
      by_reference: false,
      values: values
    };
  };

});

AnalysisClass[DOUBLE_INEQUALITY] = P(StatementAnalysis, function(obj, _super){
  obj.init = function(context, statement, tree){
    _super.init.call(this, context, statement, tree);
    this._inequalities = [];
    for(var i = 0; i < 2; i++){
      var subtree = tree.getInequality(i);
      this._inequalities.push(AnalysisClass[COMPARATOR](context, statement, subtree));
    }
  };

  obj.shade_between = true;

  obj.computeStatus = function(frame){
    for(var i = 0; i < 2; i++){
      this._inequalities[i].setAnalysis({free_variables: this._analysis.free_variables});
    }
    var statuses = this._inequalities.map(function (x) {
      x._analysis.status = x.computeStatus(frame);
      return x._analysis.status;
    }); //Compute status for each sub-inequality

    if(statuses[0] === GRAPHABLE && statuses[1] === GRAPHABLE){
      this._analysis.graph_info = this._inequalities[0]._analysis.graph_info;
      if(this._analysis.graph_info.graphMode === GRAPHMODE.POLAR)
        return this.markError(i18n.t('Two-sided inequalities are only supported for x and y.  You can do one-sided polar inequalities.'));
      return GRAPHABLE;
    }
    else{
      return this.markError(i18n.t('One or more sub-inequality had an error')); //TODO - good error messages and detection
    }
  };

  obj.computeGraphData = function(frame){
    var id = this.id;
    var graphData = {};
    graphData[id] = [];

    var updateOperator = function (s) {
      s.operator = Comparators.get(Comparators.table[s.operator].inclusive, 0);
    };

    for ( var i = 0; i < 2; i++ ) {
      var subGraphData = this._inequalities[i].computeGraphData(frame)[id].slice(0, 4);
      subGraphData.forEach(updateOperator);
      graphData[id].push.apply(graphData[id], subGraphData);
    }

    var graphMode = graphData[id][0].graphMode;
    var polygons;

    polygons = Plotter.polygonsFromSegments(graphData[id][4].segments, graphData[id][0].segments, graphMode);

    graphData[id].push(
      {
        graphMode: GRAPHMODE.POLYGONFILL,
        segments: polygons,
        poi:{}
      }
    );
    
    polygons = Plotter.polygonsFromSegments(graphData[id][7].segments, graphData[id][3].segments, graphMode);
    
    graphData[id].push(
      {
        graphMode: GRAPHMODE.POLYGONFILL,
        segments: polygons,
        poi:{}
      }
    );

    return graphData;
  };

  obj.compileAllBranches = function(frame){
    var compiled = [];
    for(var i = 0; i < 2; i++){
      compiled.push.apply(compiled, this._inequalities[i].compileAllBranches(frame));
    }
    return compiled;
  };

  obj.getOperators = function(){
    return [this._inequalities[0].getOperator(),
            this._inequalities[1].getOperator()];
  };

});

AnalysisClass[EQUATION]= P(StatementAnalysis, function(obj, _super){
  obj.init = function(context, statement, tree){
    _super.init.call(this, context, statement, tree);
    this.temp_tree = BinaryOperatorNode('-', this._tree.lhs, this._tree.rhs);
  };

  obj.is_solved_equation = true;

  //Figure out which variables to solve for, save solution in analysis
  obj.computeStatus = function(frame){
    var free_variables = this._analysis.free_variables;
    if(free_variables.length > 2) return this.freeVariablesError(free_variables);
    
    if(free_variables.length === 2){
      //Might be graphable, if variables are X and Y;
      if((free_variables[0] === 'x' && free_variables[1] === 'y') ||
         (free_variables[0] === 'y' && free_variables[1] === 'x')){
        var x_order = this.temp_tree.polynomialOrder(frame, 'x');
        var y_order = this.temp_tree.polynomialOrder(frame, 'y');
        if(y_order <= 2) return this.setGraphMode(GRAPHMODE.Y, 'x', 'y');
        if(x_order <= 2) return this.setGraphMode(GRAPHMODE.X, 'y', 'x');
        return this.markError(i18n.t("Equation is too complicated.  One variable needs to be quadratic."));
      }
      return this.markError(i18n.t('You can only plot implicit equations of x and y'));
    }

    if(free_variables.length === 1){
      //Might be evaluable, let's try
      var solution = this.solveEvaluable(frame);
      if(solution){
        this._analysis.solution = solution;
        return EVALUABLE;
      }
      else{
        return this.markError(i18n.t('Sorry - unable to solve this equation.  Try something like a quadratic?'));
      }
    }

    if(free_variables.length === 0){
      return this.markError(i18n.t("This equation has no variables in it - there's nothing to solve"));
      //TODO - support boolean true/false tests with equals sign
    }
  };

  obj.solveEvaluable = function(frame){
    var coeffs, roots;

    if(this._analysis.free_variables.length != 1) return false;

    var variable = this._analysis.free_variables[0];
    var order = this.temp_tree.polynomialOrder(frame, variable);

    switch(order){
      case 1:
        coeffs = this.temp_tree.quadraticCoefficients(frame, variable);
        roots = [-coeffs[2] / coeffs[1]];
        break;
      case 2:
        coeffs = this.temp_tree.quadraticCoefficients(frame, variable);
        roots = Quadratic.formula(coeffs);
        break;
      default:
        return false;
    }

    return {roots:roots, variable:variable};
  };

  obj.getZeroValues = function(){
    var retval = [];
    var roots = this._analysis.solution.roots;
    for(var i = 0; i < roots.length; i++){
      retval.push({val:roots[i], operator:'='});
    }
    return retval;
  };

  obj.getAssignedVariable = function(){
    switch(this._analysis.status){
      case EVALUABLE:
        return this._analysis.solution.variable;
      case GRAPHABLE:
        return this._analysis.graph_info.dependent;
    }
  };

  obj.computeGraphData = function(viewState){
    var graphData = {};
    var compiled = this.compileAllBranches(this._context.getFrame());
    var graph_info = this._analysis.graph_info;

    graphData[this.id] = [];
    for(var i = 0; i < compiled.length; i++){
      var data = Plotter.computeGraphData(viewState, graph_info, compiled[i].fn)[0];
      data.compiled = compiled[i];
      graphData[this.id].push(data);
    }
    return graphData;
  };

  obj.compileAllBranches = function(frame){
    var compiled = [];
    var independent = this._analysis.graph_info.independent;
    var dependent = this._analysis.graph_info.dependent;
    var coeffEvalStrings = this.temp_tree.polynomialEvalStrings(frame, dependent, independent);

    var evalStrings = Quadratic.formulaEvalStrings(coeffEvalStrings);

    var args = [independent];
    for(var i = 0; i < evalStrings.length; i++){
      compiled.push({fn: this.compiler.compile(args, evalStrings[i]), args:args, function_string:evalStrings[i]});
    }
    return compiled;
  };
});

AnalysisClass[COMPARATOR] = P(StatementAnalysis, function(obj, _super) {
  obj.init = function(context, statement, tree) {
    _super.init.call(this, context, statement, tree);
    var operator = this._tree.operator;
    if (Comparators.table[operator].direction === 1) {
      this.temp_tree = BinaryOperatorNode(
        '-',
        this._tree.args[0],
        this._tree.args[1]
      );
    } else {
      this.temp_tree = BinaryOperatorNode(
        '-',
        this._tree.args[1],
        this._tree.args[0]
      );
    }
  };

  obj.getDependencies = function(){
    var deps = this._tree.dependencies();
    if(_.isEqual(deps, {r:0, theta:0})){
      this.addFreeVariables(['r', 'theta']);
      return [];
    }
    if(_.isEqual(deps, {r:0})){
      this.addFreeVariables(['r']);
      return [];
    }
    return deps;
  };
  
  obj.computeStatus = function(frame){
    var free_variables = this._analysis.free_variables;
    if (free_variables.length === 0) return EVALUABLE;
    
    var singleVariables = { x: true, y: true, r: true };
    
    var fv0 = free_variables[0], fv1 = free_variables[1];
    var order0, x_order, y_order, r_order;
    
    if (free_variables.length === 1) {
      if (!singleVariables.hasOwnProperty(fv0)) {
        return this.markError(i18n.t('We only plot inequalities of x and y, or r and theta'));
      }

      order0 = this.temp_tree.polynomialOrder(frame, fv0);
      if (fv0 === 'r' && order0 > 1) {
        return this.markError(i18n.t('We only plot polar inequalities that are first order in r.'));
      }
      if (order0 > 2) {
        return this.markError(i18n.t('Equation too complicated. One variable needs to be quadratic'));
      }
      
      return this.setGraphMode(undefined, undefined, fv0);
    }
    
    var twoVariables = { x: 'y', y: 'x', r: 'theta', theta: 'r' };
    
    if (free_variables.length === 2) {
      if (twoVariables[fv0] !== fv1) {
        return this.markError(i18n.t('We only plot inequalities of x and y, or r and theta'));
      }
      
      if (fv0 === 'r' || fv1 === 'r') {
        r_order = this.temp_tree.polynomialOrder(frame, 'r');
        if (r_order > 1) {
          return this.markError(i18n.t('We only plot polar inequalities that are first order in r.'));
        }
        return this.setGraphMode(GRAPHMODE.POLAR, 'theta', 'r');
      }
      
      x_order = this.temp_tree.polynomialOrder(frame, 'x');
      y_order = this.temp_tree.polynomialOrder(frame, 'y');
      if (y_order <= 2) return this.setGraphMode(GRAPHMODE.Y, 'x', 'y');
      if (x_order <= 2) return this.setGraphMode(GRAPHMODE.X, 'y', 'x');
      return this.markError(i18n.t("Equation is too complicated.  One variable needs to be quadratic."));
      
    }
    
  };
  
  obj.computeGraphData = function(viewState){
    var graphData = {};
    var compiled = this.compileAllBranches(this._context.getFrame());
    var graph_info = this._analysis.graph_info;
    var operator = this._tree.operator;
    var thisGraphData = graphData[this.id] = [];
    var data;

    //TODO this system doesn't work with polar inequalities yet.
    //Currently, this works for first-order polar inequalities by just pushing
    //the single open-ended inequality, and leaving the rest of the branches empty
    //
    //This would need to be fixed to support second-order polar inequalities

    var polarities = [ -1, 0, 0, 1 ];

    for (var i = 0; i < 4; i++) {
      data = Plotter.computeGraphData(
        viewState,
        graph_info,
        compiled[i].fn
      )[0];
      data.compiled = compiled[i];
      data.operator = Comparators.get(
        Comparators.table[operator].inclusive,
        polarities[i]
      );
      thisGraphData.push(data);
    }

    var polygons;

    polygons = Plotter.polygonsFromSegments(
      thisGraphData[1].segments,
      thisGraphData[2].segments,
      thisGraphData[1].graphMode
    );

    thisGraphData.push({
      graphMode: GRAPHMODE.POLYGONFILL,
      segments: polygons,
      poi:{}
    });

    return graphData;
  };

  obj.compileAllBranches = function(frame){
    var compiled = [];
    var independent = this._analysis.graph_info.independent;
    var dependent = this._analysis.graph_info.dependent;
    var coeffEvalStrings = this.temp_tree.polynomialEvalStrings(frame, dependent, independent);

    var evalStrings = Quadratic.inequalityRegionEvalStrings(coeffEvalStrings);

    var args = [independent];
    for(var i = 0; i < evalStrings.length; i++){
      compiled.push({fn: this.compiler.compile(args, evalStrings[i]), args:args, function_string:evalStrings[i]});
    }
    return compiled;
  };

  obj.getOperator = function(){
    return this._tree.operator;
  };

  obj.getSlidableVariables = function(){
    //Don't offer a slider for r
    return _super.getSlidableVariables.call(this).filter(function(v){
      return (v !== 'r');
    });
  };
});

AnalysisClass[CHAINED_COMPARATOR] = P(StatementAnalysis, function(obj, _super) {
  obj.computeStatus = function (frame) {
    var free_variables = this._analysis.free_variables;
    if (free_variables.length === 0) return EVALUABLE;
    
    return this.markError(i18n.t('We only graph solved double inequalities. Try sin(x) < y < cos(x).'));
  };
  
  
});

var Table = P(AnalysisObject, function(obj, _super){
  obj.init = function(context, table_description){
    _super.init.call(this, context);
    this._description = table_description;
    this.id = table_description.id;
    this.ids_to_clean = [];
    this.columns = [];
    this.cell_tree = [];
    for(var i = 0; i < this._description.columns.length; i++){
      //Not a great solution, but since we're using the same latex parser, this is what makes sense.
      //Might make sense to eventually create a different table-header latex parser which enforces that grammar, so that the parser errors come out properly, but for now I don't think the maintenance overhead is worth it
      if(this._description.columns[i].latex === '' && i > 0){
        this._description.columns[i].latex = '\\emptycolumn_'+i; //Make empty columns behave like scatterplot
      }
      var column_analysis = createAnalysisObject(this._context, this._description.columns[i]);
      this.columns.push(column_analysis);
      this.cell_tree[i] = [];
      var values = this._description.columns[i].values;
      for(var row = 0; row < values.length; row++){
        if(values[row].trim() === ''){
          this.cell_tree[i][row] = ErrorNode('');  //Stay silent for empty cells
          continue;
        }
        this.cell_tree[i][row] = Parser.tryParse(values[row]);
      }
    }
    if(this.columns[0]._tree && this.columns[0]._tree instanceof IdentifierNode){
      this.shadowed_symbols = [this.columns[0]._tree.identifier];
      var symbol = this.shadowed_symbols[0];
      if(symbol === 'y') this.parse_error = i18n.t("Sorry - can't make a table based on y yet.  Try x?");
      if(symbol === 'r') this.parse_error = i18n.t("Sorry - can't make a table based on r yet.  Try x?");
    }
    else{
      this.parse_error = i18n.t('Tables need a single variable for their first independent column');
      this.shadowed_symbols = [];
    }
    //TODO - throw user-facing errors if any of the columns or rows try to export things
  };

  obj.isGraphed = function(){return true;}; //Always graph table, let columns decide

  obj.cleanupId = function(id){
    this.ids_to_clean.push(id);
  };

  obj.getAllIds = function(){
    var ids = [this.id];
    for(var i = 0; i < this.columns.length; i++){
      ids.push(this.columns[i].id);
    }
    return ids;
  };

  obj.exportedSymbols = function(){
    //Tables never export anything
    return [];
  };

  obj.shadowedSymbols = function(){
    return this.shadowed_symbols;
  };

  obj.getDependencies = function(){
    //Record all dependencies of all headers as dependencies
    var dependencies = {};
    var dependency;
    for(var i = 0; i < this.columns.length; i++){
      var column_dependencies = this.columns[i].getDependencies();
      for(dependency in column_dependencies){
        if(!column_dependencies.hasOwnProperty(dependency)) continue;
        //TODO - verify that all dependencies are consistent arity
        dependencies[dependency] = column_dependencies[dependency];
      }

      //Iterate over rows, for independent columns
      for(var row = 0; row < this.cell_tree[i].length; row++){
        var cell_tree = this.cell_tree[i][row];
        var cell_dependencies = cell_tree.dependencies();
        for(dependency in cell_dependencies){
          dependencies[dependency] = cell_dependencies[dependency];
        }
      }
    }
    return dependencies;
  };

  obj.referencesSymbol = function(symbol){
    //Iterate over all headers
    for(var i = 0; i < this.columns.length; i++){
    //If header references symbol, return true
      if(this.columns[i].referencesSymbol(symbol)) return true;
      //If cell references symbol return true
      for(var row = 0; row < this.cell_tree[i].length; row++){
        if(this.cell_tree[i][row].references(symbol)) return true;
      }
    }
    return false;
  };

  obj.getParseError = function(){
    if(this.parse_error) return this.parse_error;
    return this.columns[0].getParseError(); //Only the first column is unrecoverable
  };

  obj.computeStatus = function(frame){
    if(this.getParseError()) return ERROR;
    for(var i = 0; i < this.columns.length; i++){
      //Check for un-defined, variable-like dependencies, and define them as free variables
      this.columns[i]._analysis.free_variables = []; //TODO - don't reach in to private members
      var dependencies = this.columns[i].getDependencies();
      for(var dependency in dependencies){
        if(!dependencies.hasOwnProperty(dependency)) continue;
        var arity = dependencies[dependency];
        if(arity <= 1 && !frame.defines(dependency)){
          this.columns[i].addFreeVariables([dependency]);
        }
        //TODO - if arity > 1, mark column as error.  We depend on an undefined function
      }
      this.columns[i]._analysis.status = this.columns[i].computeStatus(frame);
    }
    return GRAPHABLE;
  };

  obj.invalidate = function(){
    _super.invalidate.call(this);
    this.columns.forEach(function(column){
      column.invalidate();
    });
  };

  obj.setAnalysis = function(analysis){
    _super.setAnalysis.call(this, analysis);
    this.columns.forEach(function(column){
      column.setAnalysis({});
    });
  };

  obj.getEvaluationState = function(){
    var result;
    var num_rows = this._description.columns[0].values.length;
    var columns_data = [];
    var symbol;
    var symbols = [];
    var tmp_frame = EvalFrame(this._context.getFrame()); //Track what has been defined in previous columns
    var independent_frame = EvalFrame(this._context.getFrame());
    var frame = EvalFrame(this._context.getFrame());
    var error;
    var value;
    for(var column = 0; column < this.columns.length; column++){
      var is_independent = false;
      var is_continuous = false; //Can this be graphed at all values of the independent variable, or just graph values
      error = null;

      if(this.columns[column]._tree instanceof IdentifierNode){
        symbol = this.columns[column]._tree.identifier;
        if(!tmp_frame.defines(symbol)) is_independent = true;
        if(column === 0){
          if(!is_independent){
            error = i18n.t("First column must be independent");
          }
          if(symbol === 'y' || symbol == 'theta' || symbol == 'r'){
            error = i18n.t("We don't do the right thing for tables with independent __symbol__ yet", {symbol: symbol});
          }
          if(!error){
            independent_frame.setVariable(symbol, ConstantNode(0));  //Should never be accessed, just used to say "this is defined" based on only the independent variable
          }
        }
        if(!error){
          tmp_frame.setVariable(symbol, ConstantNode(0));  //Should never be accessed, just used to say "this is defined" based on all preceding variables
        }
        symbols[column] = symbol;
      }
      if(!is_independent){
        error = this.columns[column].getParseError();
        if(!error){
          //Check if it's continuous
          try{
            result = this.columns[column].evaluateOnce(independent_frame);
            is_continuous = true;
          }
          catch(e){
            //Unable to evaluate this at all values
            is_continuous = false;
          }
          //Check if it's dependent
          try{
            result = this.columns[column].evaluateOnce(tmp_frame);
            if(typeof result !== 'number') error = result;
          }
          catch(e){
            error = e; //Mark runtime errors that always occur at column-level
          }
        }
      }


      if(this.columns[column].getParseError()){
        this.error = this.columns[column].getParseError();
      }

      var values = [];
      if(!error){
        for(var row = 0; row < num_rows; row++){
          frame = EvalFrame(this._context.getFrame());
          for(var i = 0; i < column; i++){
            if(!columns_data[i].dependent && !columns_data[i].error){
              var independent_value = columns_data[i].values[row];
              if(typeof(independent_value) === 'number')
                frame.setVariable(symbols[i], ConstantNode(independent_value));
            }
          }
          if(is_independent){
            var tree = this.cell_tree[column][row];
            if(tree.hasOwnProperty('error_msg')) value = tree.error_msg;
            else{
              try {value = tree.evaluateOnce(frame)}
              catch(e) {value = e;}
            }
          }
          else{
            try {value = this.columns[column].evaluateOnce(frame);}
            catch(e) {value = '';}
          }
          values.push(value);
        }
      }
      var column_data = {
        dependent: !is_independent,
        discrete: !is_continuous,
        error: error,
        values: values
      };
      columns_data.push(column_data);
    }
    return columns_data;
  };

  obj.computeGraphData = function(viewState){
    
    var id, x, y, row, value;
    var datum;
    var state = this.getEvaluationState(); //TODO - cache this so we don't double-compute
    var graphData = {};
    while(this.ids_to_clean.length){
      graphData[this.ids_to_clean.pop()] = {};
    }
    //Compute points for all columns vs the first column
    for(var column = 1; column < state.length; column++){
      var column_description = this._description.columns[column];
      id = this.columns[column].id;
      if (state[column].error){
        graphData[id] = {};
      }
      graphData[id] = [];
      
      var columnMode = column_description.columnMode;
      var showPoints = columnMode === COLUMNMODE.POINTS || columnMode === COLUMNMODE.POINTS_AND_LINES;
      var showLines = columnMode === COLUMNMODE.LINES || columnMode === COLUMNMODE.POINTS_AND_LINES;
      var hidden = column_description.hidden;
      if(showPoints && !hidden){
        var segments = [];
        for(row = 0; row < state[0].values.length; row++){
          //Push points into datum
          //TODO - error checking
          x = state[0].values[row];
          y = state[column].values[row];
          if(typeof(x) === 'number' && typeof(y) === 'number'){  //Don't make points for errors
            segments.push([x, y]);
          }
        }
        datum = {
        segments: [segments],
        graphMode: GRAPHMODE.XYPOINT,
        poi: copyDefinedPOIs(segments),
        color: column_description.color,
        style: column_description.style
        };
        graphData[id].push(datum);
      }

      //Connect points if discrete
      if(showLines && !hidden && state[column].discrete){
        var accumulator = Plotter.Accumulator();
        for(row = 0; row < state[0].values.length; row++){
          //Push points into datum
          //TODO - error checking
          x = state[0].values[row];
          y = state[column].values[row];
          if(typeof(x) === 'number' && typeof(y) === 'number'){  //Don't make points for errors
            accumulator.addPoint([x, y]);
          }
          else{
            accumulator.breakSegment();
          }
        }
        datum = {
        segments: accumulator.getSegments(),
        graphMode: GRAPHMODE.PARAMETRIC,
        poi: [],
        color: column_description.color,
        style: column_description.style
        };
        graphData[id].push(datum);
      }
      
      //Plot line for non-discrete headers
      if(showLines && !hidden && !state[column].discrete){
        if(this.columns[column].getStatus() === GRAPHABLE){
          var columnGraphData = this.columns[column].computeGraphData(viewState);
          if(columnGraphData[id].length !== 1) throw 'Programming error - graphData for table columns must be singleton';
          graphData[id].push(columnGraphData[id][0]);
        }
        if(this.columns[column].getStatus() === EVALUABLE || this.columns[column].getStatus() === SILENT){
          try{
            //Make and plot temporary constant function
            value = this.columns[column].evaluateOnce(this._context.getFrame());
            var graph_info = {
              graphMode: GRAPHMODE.Y,
              independent: 'x',
              dependent: 'y',
              operator: '='
            };
            var compiled = this.compileConstantFunction(value);
            var constantGraphData = Plotter.computeGraphData(viewState, graph_info, compiled.fn);
            constantGraphData[0].compiled = compiled;

            if(constantGraphData.length !== 1) throw 'Programming error - graphData for table columns must be singleton';
            graphData[id].push(constantGraphData[0]);
          } catch(e) {
            //I'm a bit worried that there may be a case I haven't thought of that will crash the above section.
            //Protecting with a defensive try/catch to make sure it doesn't mess up the rest of the graph if someone manages to come up with it
          }
        }
      }
    }
    return graphData;
  };

  obj.compileConstantFunction = function(value){
    /*jshint evil:true */
    var compiled = {
      args: [],
      function_string: 'return ' + String(value)
    };
    compiled.fn = new Function(compiled.args, compiled.function_string);
    return compiled;
  };

  // For now, tables can only have graphMode Y. Should probably enable
  // per-branch graphModes.
  obj.getGraphInfo = function () { return { graphMode: GRAPHMODE.Y }; };
  
  obj.shouldIntersect = function () { return true; };

  obj.compileAllBranches = function (frame) {
    return this.columns.slice(1).filter(function (column) {
      return column.getStatus() === GRAPHABLE;
    }).map(function (column) {
      return column.compile(frame);
    });
  };

});

var createAnalysisObject = function(context, statement){
  switch(statement.type){
    case 'table':
      return Table(context, statement);
    case 'statement':
    case undefined: //Not a good long-term solution
      var tree = Parser.tryParse(statement.latex);
      var analysisClass = AnalysisClass[tree.statementType];
      return analysisClass(context, statement, tree);
    default:
      throw("Unrecognized statement type " + statement.type);
  }
};

return {
  createAnalysisObject: createAnalysisObject,
  status: {
    ERROR: ERROR,
    WARNING: WARNING,
    EVALUABLE: EVALUABLE,
    GRAPHABLE: GRAPHABLE,
    SILENT: SILENT
  }
};

});

//Compiles from function strings into actual functions
//Allows compiled functions to reference other functions from the same scope
//which is required, since you can't closure into "new Function()" invocations

define('math/functions',['require','underscore','pjs'],function (require) {
  var _ = require('underscore');
  var P = require('pjs');

  var FunctionCompiler = P(function(compiler){
    compiler.init = function(){
      var fn_map = {};

      this.compile = function(args, evalString){
      /*jshint evil:true*/
        var fn = new Function(args, evalString);
        return _.bind(fn, fn_map);
      };

      this.register = function(name, fn){
        fn_map[name] = fn;
      };
    };

    compiler.dehydrateGraphData = function(data){
      for (var i = 0; i < data.length; i++) {
        if (data[i].compiled) {
          delete data[i].compiled.fn;
        }
      }
    };

    compiler.rehydrateGraphData = function(data){
      for (var i = 0; i < data.length; i++) {
        if (data[i].compiled) {
          data[i].compiled.fn = this.compile(
            data[i].compiled.args,
            data[i].compiled.function_string
          );
        }
      }
    };

    compiler.updateFromFunctionMap = function(fnmap){
      for(var name in fnmap){
        if(!fnmap.hasOwnProperty(name)) continue;
        this.register(name, fnmap[name]);
      }
    };

    compiler.updateFromSourceMap = function(sourcemap){
      for(var name in sourcemap){
        if(!sourcemap.hasOwnProperty(name)) continue;
        var source = sourcemap[name];
        this.register(name, this.compile(source.args, source.source));
      }
    };
  });

  return FunctionCompiler;
});

define('math/evaluatorcontext',['require','pjs','underscore','./plotter','./evalframe','./evaluatorobject','./poi','./functions','config','graphing/graphmode','main/fake_i18n'],function(require){
  var P = require('pjs');
  var _ = require('underscore');
  var Plotter = require('./plotter');
  var EvalFrame = require('./evalframe');
  var EvaluatorObject = require('./evaluatorobject');
  var POI = require('./poi');
  var Functions = require('./functions');
  var Config = require('config');
  var GRAPHMODE = require('graphing/graphmode');

  //in the worker, use our fake i18n for now,
  //which just proxies through the english translation
  var i18n = require('main/fake_i18n');

var EvaluatorContext = P(function(context){
  
  // callback noop
  context.triggerGraphComputed = function(){};
  context.triggerStatusChange = function(){};
  context.triggerRemoveGraph = function(){};
  context.triggerRender = function(){};
  context.triggerRenderSlowly = function(){};
  context.triggerDidAddStatement = function(){};
  context.triggerDidRemoveStatement = function(){};
  context.triggerDidSetCompleteState = function(){};
  context.triggerDidSetDegreeMode = function(){};
  context.triggerDidUpdateIntersections = function () {};
  context.triggerDidUpdateFunctionMap = function() {};

  context.init = function(frame){
    if(!frame) frame = EvalFrame();
    this.parent_frame = frame;
    this.statements = {};    //Each statement should be immutable
    this.analysis = null;    //This can be cleaned out at re-derived each round
    this.current_state = {}; //Remember last sent message, so that we only update when necessary
    this.dirty = {}; //dirty[id] = True or undefined
    this.graph_changed = [];
    this.compiler = Functions();
    this.intersectIds = {};

    var fm = frame.functionMap();
    for(var name in fm){
      this.compiler.register(name, fm[name]);
    }
  };

  context.eachStatement = function(fn){
    for(var id in this.statements){
      fn.apply(this, [this.statements[id]]); //Make sure this works from within context.eachStatement blocks
    }
  };
  
  context.processChangeSet = function (changeSet) {
    var ids, triggerRender;
    
    if (changeSet.isCompleteState) {
      this.statements = {};
      this.invalidate();
    }

    // update the viewport
    if (changeSet.viewState) {
      this.setViewState(changeSet.viewState);
    }
      
    // update degree mode
    if (changeSet.hasOwnProperty('degreeMode')) {
      this.setDegreeMode(changeSet.degreeMode);
    }
      
    // change which expressions 'intersectId' attempts to intersect with
    if (changeSet.hasOwnProperty('intersectIds')) {
      this.intersectIds = changeSet.intersectIds;
    }
      
    if (changeSet.statements) {
      for (var id in changeSet.statements) {
        var statement = changeSet.statements[id];
         
        // remove the statement
        if (statement === null) {
          if (!changeSet.isCompleteState && this.statements.hasOwnProperty(id)) {
            ids = this.statements[id].getAllIds();
          }
          
          this.removeStatement(id);
           
          if (!changeSet.isCompleteState && ids) {
            for (var i = 0; i < ids.length; i++) {
              this.triggerRemoveGraph(ids[i]);
            }
            this.triggerDidRemoveStatement(id);
          }
        }
          
        // add the statement
        else {
          this.addStatement(statement);
            
          if (!changeSet.isCompleteState) {
            this.triggerDidAddStatement(statement);
          }
        }
      }
    }

    if (changeSet.hasOwnProperty('intersectId')) this.updateIntersections(changeSet.intersectId);
      
    if (changeSet.isCompleteState) {
      this.triggerDidSetCompleteState(changeSet.statements);

      //Temporarily use slow rendering callback
      triggerRender = this.triggerRender;
      this.triggerRender = this.triggerRenderSlowly;
      this.publishing_paused = false;
    }

    this.publishChanges();

    if (changeSet.isCompleteState) {
      this.triggerRender = triggerRender;
    }
  };

  context.setViewState = function (viewState) {
    if (_.isEqual(viewState, this.viewState)) return;
    this.viewState = viewState;
    this.invalidate();
  };

  context.setDegreeMode = function(use_degrees) {
    this.parent_frame.setDegreeMode(use_degrees);
    this.invalidate();
    this.triggerDidSetDegreeMode(use_degrees);
  };

  context.publishing_paused = false;
  context.changes_pending = false;

  context.pausePublishing = function(){
    //console.log("PAUSING");
    this.publishing_paused = true;
  };

  context.resumePublishing = function(){
    //console.log("RESUMING");
    this.publishing_paused = false;
    if(this.changes_pending){
      this.publishChanges();
    }
  };

  context.publishChanges = function(){
    if(this.publishing_paused){
      this.changes_pending = true;
      return;
    }

    this.changes_pending = false;
   
    this.publishAllStatuses();
    if(Plotter.validateViewState(this.viewState))
      this.graphAllChanged();
  };

  context.publishAllStatuses = function(){
    //Compute new states, but only send them out if they're different from what we sent last time
    var changes = {};
    var last_state = this.current_state;
    this.current_state = {};

    this.eachStatement(function(statement){
      var id = statement.id;
      var newState = this.getEvaluationState(id);
      if(JSON.stringify(newState) !== JSON.stringify(last_state[id])){
        changes[id] = newState;
      }
      this.current_state[id] = newState;
    });
      
    this.triggerStatusChange(changes);
  };

  context.graphAllChanged = function(){
    if (!this.graph_changed.length) return;
    var viewState = this.viewState;
    var id;
    var i;
    for (i = 0; i < this.graph_changed.length; i++) {
      id = this.graph_changed[i];
      if (!this.statements.hasOwnProperty(id)) continue;
      if (this.statements[id].isGraphed()) {
        this.graph(id, viewState);
      } else {
        this.triggerRemoveGraph(id);
      }
    }
    
    var graphChangedSet = {};
    for (i = 0; i < this.graph_changed.length; i++) {
      graphChangedSet[this.graph_changed[i]] = true;
    }
    this.graph_changed = [];
    
    // Recompute all visible intersections for curves that weren't regraphed.
    // Curves that were regraphed already had their intersections updated in
    // the graph routine. Need to do this because we're only keeping track of
    // one partner in an intersection, and the other partner might have
    // changed.
    for (id in this.intersectIds) {
      if (!this.intersectIds.hasOwnProperty(id)) continue;
      if (graphChangedSet.hasOwnProperty(id)) continue;
      this.updateIntersections(id);
    }
    
    this.triggerRender();
  };

  //TODO - delegate to statement objects
  context.graph = function (id, viewState) {
    if(!viewState){
      //console.log("No view state.  Not graphing");
      return;
    }

    var statement = this.statements[id];
    var graphData = statement.computeGraphData(viewState);

    if (
      this.intersectIds.hasOwnProperty(id) &&
      statement.shouldIntersect() &&
      graphData.hasOwnProperty(id) // TODO bails on intersecting tables
    ) {
      var someIntersections = this.findSomeIntersectionsWith(id);
      
      for (var branch = 0; branch < someIntersections.intersections.length; branch++) {
        graphData[id][branch].poi.intersections = someIntersections.intersections[branch];
      }
      // If we ran out of time to compute all the intersections, stream the
      // rest of them back to the grapher as we have time.
      someIntersections.streamRest();
    }
    
    for(var sketch_id in graphData){
      this.triggerGraphComputed(sketch_id, graphData[sketch_id]);
    }
  };

  // Find all intersections between a curve with the given id and other
  // curves.
  context.updateIntersections = function (id) {
    var statement = this.statements[id];

    if (!statement || !statement.shouldIntersect()) {
      this.triggerDidUpdateIntersections(id, []);
      return;
    }

    this.findSomeIntersectionsWith(id).streamRest();

  };

  // context.findSomeIntersectionsWith computes as many intersections with the
  // curve with given id as it can in 20 ms and then returns an object:
  // {
  //   intersections: // Intersections found so far
  //   streamRest: // Function that will stream the rest of the intersections
  //               // back to the grapher.
  // }
  //
  // We run a different timeout for every curve id that is having
  // having intersections computed on it so that we can start computing
  // intersections with a few curves at once without having them cancel
  // eachother. This will happen if you open intersections on a few different
  // curves and then change something that triggers a graphAll.
  //
  // Note that we typically only stick the intersection POI on one of the two
  // curves that is involved in an intersection (the one that was selected
  // when the intersection was computed).
  var streamIntersectionsTimeouts = {};
  context.findSomeIntersectionsWith = function (id1) {
    this.cancelIntersectionStreaming(id1);
    
    var runFor = 20; // ms
    var waitFor = 60; // ms
    var self = this;
    var push = Array.prototype.push;
    var statement1 = self.statements[id1];
    var graph_info = statement1.getGraphInfo();
    var graphMode = graph_info.graphMode;
    var compiled1 = self.statements[id1].compileAllBranches(self.getFrame());
    var domain = Plotter.computeDomain(self.viewState, graph_info, null);
    
    var otherStatements = [];
    for (var id2 in self.statements) {
      if (!self.statements.hasOwnProperty(id2)) continue;
      if (String(id2) === String(id1)) continue;
      otherStatements.push(self.statements[id2]);
    }
    
    // intersections accumulator and iterator i are modified during successive
    // calls to computeSome()
    var intersections = [];
    for (var branch = 0; branch < compiled1.length; branch++) {
      intersections[branch] = { x: [], y: [], intersects: [] };
    }
    var i = otherStatements.length - 1;
    var stream = false;
    var computeSome = function () {
      /*jshint loopfunc: true */
      var now = new Date();
      var updated = false;
      var fn1;
      var fn2;
      var newIntersections;
      var statement2;
      var compiled2;
      var swap;
      var differenceSamples;
      for (i; i >= 0; i--) {
        if (new Date() - now > runFor) {
          if (!stream) return;
          streamIntersectionsTimeouts[id1] = setTimeout(computeSome, waitFor);
          if (!updated) return;
          self.triggerDidUpdateIntersections(id1, intersections);
          return;
        }
        statement2 = otherStatements[i];
        if (!statement2.shouldIntersect()) continue;
        if (statement2.getGraphInfo().graphMode !== graphMode) continue;

        compiled2 = statement2.compileAllBranches(self.getFrame());

        for (var branch1=0; branch1 < compiled1.length; branch1++) {
          fn1 = compiled1[branch1].fn;
          for (var branch2 = 0; branch2 < compiled2.length; branch2++) {
            fn2 = compiled2[branch2].fn;
            differenceSamples = Plotter.sampleXY(function (x) {
              return fn2(x) - fn1(x);
            }, domain);
            newIntersections = POI.findIntersections(
              differenceSamples,
              fn1,
              fn2
            );
            if (newIntersections.x.length) updated = true;
            newIntersections.intersects = Array(newIntersections.x.length);
            for (var j = 0, jlen = newIntersections.x.length; j < jlen; j++) {
              newIntersections.intersects[j] = statement2.id;
            }
            // Need to swap x and y if graphmode is GRAPHMODE.X
            if (graphMode === GRAPHMODE.X) {
              swap = newIntersections.y;
              newIntersections.y = newIntersections.x;
              newIntersections.x = swap;
            }
            push.apply(intersections[branch1].x, newIntersections.x);
            push.apply(intersections[branch1].y, newIntersections.y);
            push.apply(intersections[branch1].intersects, newIntersections.intersects);
          }
        }
      }
      
      if (!stream || !updated) return;
      self.triggerDidUpdateIntersections(id1, intersections);
      self.cancelIntersectionStreaming(id1);
    };

    computeSome();

    return {
      intersections: intersections,
      streamRest: function () {
        // Slightly wasteful, but handy for clearing old intersections early.
        self.triggerDidUpdateIntersections(id1, intersections);
        stream = true;
        computeSome();
      }
    };

  };
  
  context.cancelIntersectionStreaming = function (id) {
    clearTimeout(streamIntersectionsTimeouts[id]);
    delete streamIntersectionsTimeouts[id];
  };

  context.cancelAllIntersectionStreaming = function () {
    for (var id in streamIntersectionsTimeouts[id]) {
      if (!streamIntersectionsTimeouts.hasOwnProperty(id)) continue;
      this.cancelIntersectionStreaming(id);
    }
  };

  //Takes a object representing an "expression" (TODO - rename this concept)
  //Expects expr to have properties:
  // * id (integer)
  // * latex (string)
  // * shouldGraph (boolean)
  // * color (string)
  context.addStatement = function(statement){
    if(!statement) return;
    var id = statement.id;
    this.markDirty(id); // Mark existing dependencies as dirty

    var previous_ids;  //Used to tell tables to ungraph old columns

    if(this.statements.hasOwnProperty(id)){
      previous_ids = this.statements[id].getAllIds();
    }

    this.statements[id] = EvaluatorObject.createAnalysisObject(this, statement);
    
    if(previous_ids){
      for(var i = 0; i< previous_ids.length; i++){
        var previous_id = previous_ids[i];
        if(previous_id != id){
          this.statements[id].cleanupId(previous_id);
        }
      }
    }
    // Need to mark clean before marking dirty again because otherwise we'll
    // hit an early return and fail to mark new dependencies dirty.
    this.markClean(statement.id);
    this.markDirty(statement.id); // Mark any new dependencies as dirty
  };

  context.removeStatement = function(id){
    if(!this.statements.hasOwnProperty(id)) return;
    // Looks like it was already deleted.
    // This happens when a table is deleted, and then each column is deleted.

    this.markDirty(id); //Mark dirty before deletion
    delete this.statements[id];
  };

  context.recompute = function(){
    this.invalidate();
    this.publishChanges();
  };

  context.invalidate = function(){
    this.analysis = null;
    this.current_state = {};
    this.cancelAllIntersectionStreaming();
  };

  context.markDirty = function(id){
    if(this.dirty[id]) return;
    this.dirty[id] = true;
    this.cancelIntersectionStreaming(id);
    //symbols which id exports
    if (!this.statements[id]) return;
    for(var symbol in this.statements[id].exportedSymbols()){
      this.markSymbolDirty(symbol);
    }
  };

  context.markSymbolDirty = function(symbol){
    if(this.assignmentForbidden(symbol)) return;
    this.eachStatement(function(statement){
      if(statement.referencesSymbol(symbol)){
        this.markDirty(statement.id);
      }
    });
  };

  context.markClean = function(id){
    delete(this.dirty[id]);
  };

  context.isDirty = function(id){
    return this.dirty.hasOwnProperty(id);
  };

  context.getFrame = function(){
    //Return frame, updating if necessary.
    return this.getAnalysis().frame;
  };

  context.getAnalysis = function(){
    this.updateAnalysis();
    return this.analysis;
  };

  context.getType = function(id){
    return this.statements[id].getType();
  };

  context.updateAnalysis = function(){
    if(this.hasOwnProperty('partial_analysis')) throw "Programming error - two overlapping call to updateAnalysis";
    
    var dirty_statements = [];
    var id;
    if(this.analysis){
      for(id in this.dirty){
        dirty_statements.push(id);
      }
      //If we already have analysis and nothing is dirty, return
      if(dirty_statements.length === 0) return;
    }
    else{
      for(id in this.statements){
        dirty_statements.push(id);
      }
    }

    //For a first pass, re-run the analysis for everything (since that's cheap), only graph dirty statements
    delete(this.analysis);
    this.partial_analysis = {};
    var a = this.partial_analysis;
    try{

      a.frame = EvalFrame(this.parent_frame);

      this.eachStatement(function(statement){
        var id = statement.id;
        a[id] = {};
        statement.setAnalysis(a[id]);
        var error = statement.getParseError();
        if(error) a[id].error = error;
      });

      a.assignments = this.analyzeAssignments();
      this.markVariableConflicts(a.assignments);

      this.analyzeDependencies(a);

      for (var i = 0; i < a.dependencyOrder.length; i++) {
        id = a.dependencyOrder[i];
        this.statements[id].exportDefinitionsTo(a.frame, id);
      }

      this.graph_changed = dirty_statements;
      this.dirty = {};

      var fm = a.frame.leafFunctionMap(); //Only update new functions, nothing from parent frame
      for(var name in fm){
        this.compiler.register(name, fm[name]);
      }
      //Used to send function definitions from worker to UI thread for tracing
      this.triggerDidUpdateFunctionMap(a.frame);

      this.analyzeStatus(a);

      if (Config.get('dragpoints')) {
        // Need to do this after analyzeStatus because we need to know which
        // variables are slidable in order to know which statements are movable
        this.analyzeMovable(a);
      }
      
      //Mark analysis as done, and make it active
      this.analysis = this.partial_analysis;
    }
    catch(e){
      //Error in analysis - invalidate everything so that we don't persist anything
      this.invalidate();
    }
    finally{
      //No matter what, partial_analysis should dissapear
      delete(this.partial_analysis);
    }
  };

  context.evaluateOnce = function(id){
    if(!this.statements.hasOwnProperty(id)) {throw('Statement ' + id + ' not defined');}
    return this.statements[id].evaluateOnce(this.getFrame());
  };

  context.compile = function(id){
    return this.statements[id].compile(this.getFrame());
  };

  context.evalStrings = function(id){
    return this.statements[id].evalStrings(this.getFrame());
  };

  context.analyzeStatus = function(a){
    this.eachStatement(function(statement){
      var id = statement.id;
      var s = this.partial_analysis[id];
      if(s.error) s.status = EvaluatorObject.status.ERROR;
      if(s.status) return;
      s.status = statement.computeStatus(a.frame);
    });
  };

  context.assignmentForbidden = function(identifier){
    return (identifier === 'x' || identifier === 'y' || identifier === 'theta');
  };

  context.getStatus = function(id){
    if (this.getAnalysis()[id] === undefined)
      return undefined;
    return this.getAnalysis()[id].status;
  };

  //Returns an object that mirrors the API of Formula
  context.getEvaluationState = function(id){
    this.getAnalysis(); // Used for side-effects
    return this.statements[id].getEvaluationState();
  };

//Analyzing dependencies
     //Iterate over all definitions to identify multiple-definitions and mark defined identifiers with type
        //Multiple definitions are OK, as long as they are not referenced
     //Scan all statements, recording dependencies as free variables, or defined functions/variables
        //During this scan, drop out any equations which reference multiply-defined identifiers
        //During this scan, build data-structure for dependency DAG
     //Crawl data-structure, to create evaluation ordering with clean dependencies
     //Identify cycles in remaining statements, and mark those as errors
     //Return clean ordering, to be used in frame generation and compilation

  context.analyzeAssignments = function(){
    var assignments = {};
    this.eachStatement(function(statement){
      var exports = statement.exportedSymbols();
      for(var symbol in exports){
        if(this.assignmentForbidden(symbol)) continue; //Nobody gets to assign x or y globally
        if(this.parent_frame && this.parent_frame.defines(symbol)){
          statement.markError(i18n.t("Cannot redefine __symbol__", {symbol: symbol}));
          continue;
        }
        if(!assignments.hasOwnProperty(symbol)) {assignments[symbol] = []}
        assignments[symbol].push({id:statement.id, arity:exports[symbol]});
      }
    });
    return assignments;
  };

  context.markVariableConflicts = function(assignments){
    this.eachStatement(function(statement){
      var shadowed = statement.shadowedSymbols();
      for(var i = 0; i < shadowed.length; i++){
        var symbol = shadowed[i];
        if(assignments.hasOwnProperty(symbol)){
          // TODO - define this error message
          // '"' + conflicts[0] + '" is already defined, so you can\'t use it as one of the parameters of this function.
          // You could try a different letter, or using a subscript.';
          statement.conflictError(symbol);
        }
      }
    });
  };

  //Returns dependency-ordered sequence of statement ids
  context.analyzeDependencies = function(a){
    var order = [];       //The IDs of the sequence (built up incrementally)
    var ready = [];       //IDs of which statements are ready to add to the sequence
    var block_count = {}; //IDs of blocked statments are keys => number of blockers.
    var blocked_on = {};  //Term string are keys => IDs of blocked statements;

    //Note - for now, the same term can show up as a blocker multiple times for the same statement.
    //This is correct, but could become inefficient.  We might want to make the dependency lists unique.

    //Initialize data structure to be able to query DAG efficiently
    for (var id in this.statements){
      var s = a[id];
      s.free_variables = [];
      if(!this.statements.hasOwnProperty(id)) continue;
      //Track dependencies
      var dependencies = this.statements[id].getDependencies();
      block_count[id] = 0;
      for(var dependency in dependencies){
        if (!dependencies.hasOwnProperty(dependency)){continue;}
        var dependency_arity = dependencies[dependency];

        if(this.parent_frame){
          //If we're looking for a variable and the parent defines it, we're good (arity 1 could be either)
          if((dependency_arity <= 1) && this.parent_frame.hasVariable(dependency)) {
            continue;
          }

          //If we're looking or a function with specific arity and the parent defines it, we're good
          if((dependency_arity >= 1) && this.parent_frame.hasFunctionWithArity(dependency, dependency_arity)){
            continue;
          }
        }

        var assigners = a.assignments[dependency];  //List of IDs for statements which define dependency
        //0 assigners => free variable or error, if it's a function
        if(this.parent_frame && this.parent_frame.defines(dependency)){
          var real_arity = this.parent_frame.arity(dependency);
          if(real_arity === 0){
            s.error = i18n.t("Cannot call constant __dependency__ as a function", {dependency: dependency});
          }
          if(real_arity > 0){
            s.error = i18n.t(
              "__dependency__ is a function that requires __real_arity__ arguments",
              {
                dependency: dependency,
                real_arity: real_arity
              }
            );
          }
          else{
            s.error = i18n.t("Something has gone wrong.  Please report this to desmos.com support");
          }
          continue;
        }
        if(!assigners || assigners.length === 0){
          if (dependency_arity <= 1){
            this.statements[id].addFreeVariables([dependency]);
          }
          else{
            s.error = i18n.t(
              "Function __dependency__ isn't defined. Try defining it in a new expression",
              {
                dependency: dependency
              }
            );
          }
        }

        //1 => possibly healthy dependency
        if(assigners && assigners.length === 1){
          var assignment_arity = assigners[0].arity;

          if (
            // Check if assignment has the same arity as our dependency
            assignment_arity === dependency_arity ||
            // Ambiguous dependency can be resolved with arity 1 function or variable.
            (assignment_arity === 0 && dependency_arity === 1)
          ) {

            if(!blocked_on.hasOwnProperty(dependency)) { blocked_on[dependency] = []; } //create list if empty

            blocked_on[dependency].push(id);
            block_count[id]++;
          }
          else if (assignment_arity === 0) {
            s.error = (i18n.t(
              "'__dependency__' is a variable, so can't be used as a function",
              {dependency: dependency}
            ));

          } else if (assignment_arity == 1) {
            s.error = (
              i18n.t(
                'Function \'__dependency__\' requires an argument. ',
                { dependency: dependency }
              ) + i18n.t(
                'For example, try typing: __dependency__(x)',
                {dependency: dependency}
              )
            );
          } else {
            var args = [];
            //construct an example of using the function
            for (var i = 0 ; i < assignment_arity ; i++) {args[i] = i+1; }
            var recommendation = dependency + "(" + args.join(", ") + ")";

            s.error = (
              i18n.t(
                'Function \'__dependency__\' requires __assignment_arity__ arguments. ',
                {
                  dependency: dependency,
                  assignment_arity: assignment_arity
                }
              ) + i18n.t('For example, try typing: __recommendation__', {recommendation: recommendation})
            );
          }
        }
        //>1 => dependency on an ambiguous term
        if(assigners && assigners.length > 1){
          s.error = (i18n.t(
            "'__dependency__' is defined more than once. Try deleting all but one definition of '__dependency__'",
            {dependency: dependency}
          ));
          //TODO - put errors or warning on all assigners as well
        }
      }
      if (block_count[id] === 0){
        ready.push(id);
      }
    }

    //Keep pulling from ready list until it's empty (either we're done, or we can't finish)
    while(ready.length){
      var next = ready.pop();
      if(a[next].error){
        // TODO Mark dependencies as errors for depending on it - currently just letting them fail the same as circular
        // dependencies
        continue;
      }
      order.push(next);
      var exported = this.statements[next].exportedSymbols();
      for(var symbol in exported){
        var unblocked_list = blocked_on[symbol];
        if(!unblocked_list) continue;  //Doesn't unblock anything else

        while(unblocked_list.length){
          var unblocked = unblocked_list.pop();
          this.statements[unblocked].addFreeVariables(a[next].free_variables);
          block_count[unblocked]--;      //Unblocks everything that depends on whatever next defines
          if (block_count[unblocked] === 0){
            delete block_count[unblocked];
            ready.push(unblocked);
          }
        }
      }
    }

    for(id in block_count){
      if(block_count.hasOwnProperty(id) && block_count[id] !== 0){
        a[id].unresolved = true;
        a[id].error = i18n.t("Circular dependency");
      }
    }

    a.dependencyOrder = order;
  };

  context.analyzeMovable = function (a) {
    this.eachStatement(function (statement) {
      if (statement.computeMovable) statement.computeMovable(a.frame);
    });
  };

});

return EvaluatorContext;

});
define('worker/workercore',['require','math/evaluatorcontext','math/builtinframe','math/derivative'],function(require){
  var EvaluatorContext = require('math/evaluatorcontext');
  var BuiltInFrame = require('math/builtinframe');
  require('math/derivative');

  return function(sendMessage){

    //Initialize environment
    var context = EvaluatorContext(BuiltInFrame);

    //Functions to send data back to main thread
    context.triggerGraphComputed = function(id, data){
      //Can't pass function objects across worker boundary.  Will re-create on other side
      for(var i = 0; i < data.length; i++){
        if(data[i].compiled) delete data[i].compiled.fn;
      }
      sendMessage('graphComputed', {id:id, graphData:data});
    };

    context.triggerDidUpdateIntersections = function(id, intersections) {
      sendMessage('updateIntersections', {id:id, intersections:intersections});
    };

    context.triggerDidUpdateFunctionMap = function(frame){
      sendMessage('updateFunctionMap', frame.leafFunctionSourceMap());
    };

    context.triggerRender = function(){
      sendMessage('render');
    };

    context.triggerRenderSlowly = function(){
      sendMessage('renderSlowly');
    };

    context.triggerRemoveGraph = function(id){
      sendMessage('removeGraph', id);
    };

    context.triggerDidSetDegreeMode = function(use_degrees){
      sendMessage('setDegreeMode', use_degrees);
    };

    context.triggerStatusChange = function(data){
      sendMessage('statusChange', data);
    };
    
    return {
      processChangeSet: function (changeSet) {
        context.processChangeSet(changeSet);
        
        sendMessage('processChangeSet', changeSet);
      }
    };
    
  };

});

/* jshint worker: true */
define('worker/worker',['require','worker/workercore'],function(require){
  var WorkerCore = require('worker/workercore');
  var workerCore = WorkerCore(sendMessage);
  
  self.window = self;
  self.console = {};
  self.console.log = function (m) { sendMessage('log', m); };
 
  function sendMessage (type, payload) {
    self.postMessage({type:type, payload:payload});
  }
 
  self.onmessage = function(e){
    workerCore.processChangeSet(e.data);
  };

  if (self.loadMessageQueue) {
    self.loadMessageQueue.forEach(function (e) { self.onmessage(e); });
  }
});

/* jshint worker: true */
//Used for /embed/graphpaper and for /calculator

//Bootstrap if run standalone (for noconcat)
if (typeof requirejs === 'undefined'){
  importScripts('../vendor/underscore.js');
  importScripts('../vendor/require.js');
  importScripts('config.js');
}

// Queue messages until the onmessage handler becomes available.
self.loadMessageQueue = [];
self.onmessage = function (e) {
  self.loadMessageQueue.push(e);
};

requirejs(['worker/worker']);

define("toplevel/worker", function(){});
