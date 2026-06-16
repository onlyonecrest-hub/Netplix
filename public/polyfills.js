// Polyfills for older browsers and VIDAA Smart TV compatibility

// Promise polyfill - basic implementation for older browsers
if (typeof Promise === 'undefined') {
  window.Promise = function(executor) {
    var self = this;
    self._state = 'pending';
    self._value = null;
    self._handlers = [];
    
    var resolve = function(value) {
      if (self._state !== 'pending') return;
      self._state = 'fulfilled';
      self._value = value;
      self._handlers.forEach(function(h) { h(); });
    };
    
    var reject = function(reason) {
      if (self._state !== 'pending') return;
      self._state = 'rejected';
      self._value = reason;
      self._handlers.forEach(function(h) { h(); });
    };
    
    try {
      executor(resolve, reject);
    } catch(e) {
      reject(e);
    }
  };
  
  Promise.prototype.then = function(onFulfilled, onRejected) {
    var self = this;
    return new Promise(function(resolve, reject) {
      self._handlers.push(function() {
        if (self._state === 'fulfilled') {
          try {
            resolve(onFulfilled ? onFulfilled(self._value) : self._value);
          } catch(e) {
            reject(e);
          }
        } else {
          reject(onRejected ? onRejected(self._value) : self._value);
        }
      });
      if (self._state !== 'pending') self._handlers.forEach(function(h) { h(); });
    });
  };
  
  Promise.prototype.catch = function(onRejected) {
    return this.then(null, onRejected);
  };
}

// Fetch API polyfill using XMLHttpRequest
if (typeof fetch === 'undefined') {
  window.fetch = function(url, options) {
    options = options || {};
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.onload = function() {
        var contentType = xhr.getResponseHeader('content-type');
        var response = {
          status: xhr.status,
          statusText: xhr.statusText,
          ok: xhr.status >= 200 && xhr.status < 300,
          headers: {
            get: function(name) {
              return xhr.getResponseHeader(name);
            }
          },
          text: function() {
            return Promise.resolve(xhr.responseText);
          },
          json: function() {
            return new Promise(function(resolveJson, rejectJson) {
              try {
                resolveJson(JSON.parse(xhr.responseText));
              } catch(e) {
                rejectJson(e);
              }
            });
          }
        };
        resolve(response);
      };
      xhr.onerror = function() {
        reject(new Error('Network error'));
      };
      xhr.ontimeout = function() {
        reject(new Error('Request timeout'));
      };
      
      xhr.open(options.method || 'GET', url, true);
      if (options.headers) {
        Object.keys(options.headers).forEach(function(header) {
          xhr.setRequestHeader(header, options.headers[header]);
        });
      }
      xhr.send(options.body || null);
    });
  };
}

// AbortController polyfill for fetch timeout support
if (typeof AbortController === 'undefined') {
  window.AbortController = function() {
    this.signal = { aborted: false };
  };
  AbortController.prototype.abort = function() {
    this.signal.aborted = true;
  };
}

// Object.entries polyfill
if (!Object.entries) {
  Object.entries = function(obj) {
    var entries = [];
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        entries.push([key, obj[key]]);
      }
    }
    return entries;
  };
}

// Object.fromEntries polyfill
if (!Object.fromEntries) {
  Object.fromEntries = function(iterable) {
    var obj = {};
    iterable.forEach(function(entry) {
      obj[entry[0]] = entry[1];
    });
    return obj;
  };
}

// Array.from polyfill
if (!Array.from) {
  Array.from = function(arrayLike) {
    if (!arrayLike) return [];
    var arr = [];
    for (var i = 0; i < arrayLike.length; i++) {
      arr.push(arrayLike[i]);
    }
    return arr;
  };
}

// String.prototype.includes polyfill
if (!String.prototype.includes) {
  String.prototype.includes = function(searchString, position) {
    position = position || 0;
    return this.indexOf(searchString, position) !== -1;
  };
}

// String.prototype.startsWith polyfill
if (!String.prototype.startsWith) {
  String.prototype.startsWith = function(searchString, position) {
    position = position || 0;
    return this.indexOf(searchString, position) === position;
  };
}

// String.prototype.endsWith polyfill
if (!String.prototype.endsWith) {
  String.prototype.endsWith = function(searchString, length) {
    if (length === undefined) {
      length = this.length;
    }
    length = length - searchString.length;
    var index = this.lastIndexOf(searchString);
    return index !== -1 && index === length;
  };
}

// String.prototype.padStart polyfill
if (!String.prototype.padStart) {
  String.prototype.padStart = function(targetLength, padString) {
    targetLength = Math.floor(targetLength) || 0;
    if (targetLength < this.length) {
      return String(this);
    }
    padString = String(padString || ' ');
    if (padString.length === 0) {
      return String(this);
    }
    var pad = '';
    var len = targetLength - this.length;
    while (pad.length < len) {
      pad += padString;
    }
    return pad.slice(0, len) + String(this);
  };
}

// Array.prototype.find polyfill
if (!Array.prototype.find) {
  Array.prototype.find = function(predicate) {
    for (var i = 0; i < this.length; i++) {
      if (predicate(this[i], i, this)) {
        return this[i];
      }
    }
    return undefined;
  };
}

// Array.prototype.findIndex polyfill
if (!Array.prototype.findIndex) {
  Array.prototype.findIndex = function(predicate) {
    for (var i = 0; i < this.length; i++) {
      if (predicate(this[i], i, this)) {
        return i;
      }
    }
    return -1;
  };
}

// Array.prototype.includes polyfill
if (!Array.prototype.includes) {
  Array.prototype.includes = function(searchElement) {
    return this.indexOf(searchElement) !== -1;
  };
}

// Map polyfill for older browsers
if (typeof Map === 'undefined') {
  window.Map = function() {
    this._data = [];
  };
  Map.prototype.set = function(key, value) {
    for (var i = 0; i < this._data.length; i++) {
      if (this._data[i][0] === key) {
        this._data[i][1] = value;
        return this;
      }
    }
    this._data.push([key, value]);
    return this;
  };
  Map.prototype.get = function(key) {
    for (var i = 0; i < this._data.length; i++) {
      if (this._data[i][0] === key) {
        return this._data[i][1];
      }
    }
    return undefined;
  };
  Map.prototype.has = function(key) {
    return this.get(key) !== undefined;
  };
  Map.prototype.delete = function(key) {
    for (var i = 0; i < this._data.length; i++) {
      if (this._data[i][0] === key) {
        this._data.splice(i, 1);
        return true;
      }
    }
    return false;
  };
  Map.prototype.clear = function() {
    this._data = [];
  };
  Map.prototype.entries = function() {
    return this._data.slice();
  };
  Map.prototype.forEach = function(callback, thisArg) {
    this._data.forEach(function(entry) {
      callback.call(thisArg, entry[1], entry[0], this);
    }, this);
  };
}

// crypto.randomUUID polyfill (already handled in app.js but adding here for completeness)
if (!window.crypto) {
  window.crypto = {};
}
if (!window.crypto.randomUUID) {
  window.crypto.randomUUID = function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
}

// JSON polyfill (unlikely but just in case for really old devices)
if (typeof JSON === 'undefined') {
  window.JSON = {
    stringify: function(obj) {
      var type = typeof obj;
      if (type === 'string') return '"' + obj.replace(/"/g, '\\"') + '"';
      if (type === 'number' || type === 'boolean') return String(obj);
      if (obj === null) return 'null';
      if (Array.isArray(obj)) {
        var items = [];
        for (var i = 0; i < obj.length; i++) {
          items.push(JSON.stringify(obj[i]));
        }
        return '[' + items.join(',') + ']';
      }
      if (type === 'object') {
        var props = [];
        for (var key in obj) {
          if (obj.hasOwnProperty(key)) {
            props.push(JSON.stringify(key) + ':' + JSON.stringify(obj[key]));
          }
        }
        return '{' + props.join(',') + '}';
      }
      return undefined;
    },
    parse: function(text) {
      return eval('(' + text + ')');
    }
  };
}

// localStorage polyfill for very old devices
if (typeof localStorage === 'undefined') {
  window.localStorage = {
    _data: {},
    setItem: function(key, value) {
      this._data[key] = String(value);
    },
    getItem: function(key) {
      return this._data[key] || null;
    },
    removeItem: function(key) {
      delete this._data[key];
    },
    clear: function() {
      this._data = {};
    }
  };
}

// Element.closest polyfill for IE
if (!Element.prototype.closest) {
  Element.prototype.closest = function(s) {
    var el = this;
    do {
      if (el.matches(s)) return el;
      el = el.parentElement || el.parentNode;
    } while (el !== null && el.nodeType === 1);
    return null;
  };
}

// Element.matches polyfill for IE
if (!Element.prototype.matches) {
  Element.prototype.matches =
    Element.prototype.matchesSelector ||
    Element.prototype.mozMatchesSelector ||
    Element.prototype.msMatchesSelector ||
    Element.prototype.oMatchesSelector ||
    Element.prototype.webkitMatchesSelector ||
    function(s) {
      var matches = (this.document || this.ownerDocument).querySelectorAll(s);
      var i = matches.length;
      while (--i >= 0 && matches.item(i) !== this) {}
      return i > -1;
    };
}

// classList polyfill for IE9
if (!Element.prototype.classList) {
  Object.defineProperty(Element.prototype, 'classList', {
    get: function() {
      var self = this;
      return {
        contains: function(className) {
          return (self.className || '').split(' ').indexOf(className) !== -1;
        },
        add: function(className) {
          if (!this.contains(className)) {
            self.className = (self.className ? self.className + ' ' : '') + className;
          }
        },
        remove: function(className) {
          var classes = (self.className || '').split(' ').filter(function(c) {
            return c !== className;
          });
          self.className = classes.join(' ').trim();
        },
        toggle: function(className) {
          if (this.contains(className)) {
            this.remove(className);
          } else {
            this.add(className);
          }
        }
      };
    }
  });
}
