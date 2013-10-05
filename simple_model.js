//= require ../vendor/p
//= require ../vendor/underscore

/*
 * simple model that has listeners, copied from underscore_model in desmos
 */

/* exported SimpleModel */
var SimpleModel = P(function (model) {
  
  model.init = function () {
    this.__observers = {};
    this.__oldProperties = {};
    this.__propertyComparators = {};
  };
  
  model.getProperty = function (property) {
    return this[property];
  };
  
  model.getOldProperty = function (property) {
    return this.__oldProperties[property];
  };
  
  model.setProperty = function (property, newValue) {
    var oldValue = this[property];
    var comparator = this.__propertyComparators[property];
    if (comparator) {
      if (comparator(oldValue, newValue)) {
        return;
      }
    } else if (_.isEqual(oldValue, newValue)) {
      return;
    }
    
    this.__oldProperties[property] = oldValue;
    this[property] = newValue;
    this.notifyPropertyChange(property);
  };
  
  model.setPropertyComparator = function (property, comparator) {
    this.__propertyComparators[property] = comparator;
  };
  
  model.notifyPropertyChange = function (property) {
    var observers = this.__observers[property];
    if (observers) {
     for (var i=0; i<observers.length; i++) {
       observers[i].callback(property, this);
     }
    }
  };
  
  model.unobserve = function (property_string) {
    
    // get rid of all observers
    if (!property_string) {
      this.__observers = {};
      return;
    }
    
    var properties = property_string.split(" ");
    for (var i=0; i<properties.length; i++) {
      var property_parts = properties[i].split(".");
      var property = property_parts[0];
      var namespace = property_parts[1];

      // only keep the ones with a different namespace
      if (property && namespace) {
        var original = this.__observers[property];
        var filtered = [];
        if (!original) continue;
        for (var j=0; j<original.length; j++) {
          var observer = original[j];
          if (observer.namespace !== namespace) {
            filtered.push(observer);
          }
        }
        this.__observers[property] = filtered;
        
      // get rid of all of observers for this property since no namespace given
      } else if (property) {
        if (this.__observers[property]) {
          this.__observers[property] = [];
        }
              
      // we aren't given a property, only a namespace. run through each
      // property that has observers and call .unobserve(property.namespace)
      } else if (namespace) {
        for (property in this.__observers) {
          this.unobserve(property + "." + namespace);
        }
      }
    }
  };
  
  model.observe = function (property_string, callback) {
    var properties = property_string.split(" ");
    for (var i=0; i<properties.length; i++) {
      var property_parts = properties[i].split(".");
      var property = property_parts[0];
      if (!property) throw 'Must supply a property to observe';
      
      var namespace = property_parts[1];
      var observer = {
        namespace: namespace,
        callback: callback
      };
      
      var observers = this.__observers[property];
      if (!observers) {
        this.__observers[property] = [observer];
      } else {
        observers.push(observer);
      }
    }
  };
});
