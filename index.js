'use strict';

module.exports = function(FollowService, UserService, WishService, $timeout, $q, store) {
  /**
   *  These types correspond to key names in the
   *  data we expect to get from the server.
   */
  var _types = {
    user: 'user',
    wishlist: 'wishlist',
    followers: 'followers',
    following: 'following'
  };
  var _services = {};
  var _stores = {};
  var _newStoreCompositionPromise;

  _services[_types.user] = UserService;
  _services[_types.wishlist] = WishService;
  _services[_types.followers] = _services[_types.following] = FollowService;
  
  var Store = function(type, id, listener) {
    _stores[id] = this;
    
    this.id = id;
    this.listeners = [];

    _newStoreCompositionPromise = composeUser(id, this).then(function(result) {
      this.data = result;

      if(typeof listener !== 'undefined') {
        patchToStore.call(this, type, listener);
        broadcast.call(this, type);
      }

      setLocalStorage(this);
    }.bind(this));

    /**
     *  Immediately resolve this promise in case we call Stores#get
     *  on a Store that doesn't exist yet.
     *
     *  REVIEW: Should we be resolving a promise here that doesn't
     *  return the results of the promise, and instead just returns
     *  side effects?
     */
    return _newStoreCompositionPromise.then(function() {
      return this;
    }.bind(this));
  };
  
  /**
   *  These are the actual factory methods that
   *  we will expose to the user of the factory.
   */
  return {
    get: get,
    types: _types,
    update: update
  };

  /////////////////////////////////////////////////////////////////////////

  /**
   *  This will propagate the data to the components.
   *
   *  @param type {Stores::types}
   *  @param isUpdate {Boolean} whether or not we're broadcasting
   *                            the original data, or an update.
   */
  function broadcast(type, isUpdate) {
    /**
     *  Here, if there's an update, we're going to
     *  run through *all* Stores and invoke listeners
     *  of that specific type.
     */
    if(isUpdate === true) {
      // REVIEW: invoke listeners of type in ALL stores

      for(var id in _stores) {
        _stores[id].listeners.forEach(function(l) {
          if(l.type === _types.user || l.type === type) {
            // REVIEW: change l.type below to type
            l.callback(_stores[id].data[l.type] || _stores[id].data);
          }
        });        
      }
    } else {
      /**
       *  Otherwise, we'll only invoke Stores'
       *  listeners for components that care only
       *  about this specific type of data.
       */
      this.listeners.forEach(function(l) {
        if(l.type === type) {
          try {
            l.callback(this.data[type] || this.data);
          } catch(e) {
            console.warn('Something is wrong with your data!', e);
          }
        }
      }.bind(this));
    }
  }

  /**
   *  Checks if the Store exists in local storage.
   *  If so, it'll broadcast that potentially stale data
   *  while the fresh data loads in the background.
   *
   *  @context {Store}
   *  @param type {Stores::types}
   *  @param nakedListenerFn {Function}
   */
  function broadcastCachedData(type, nakedListenerFn) {
    var data;

    if(!!this && typeof nakedListenerFn !== 'undefined') {
      if('data' in this) {
        if(type === 'user') {
          data = this.data;
        } else {
          data = this.data[type];
        }

        try {
          return nakedListenerFn(data);
        } catch (e) {
          console.warn('Something is wrong with your data!', e);
        }
      }
    }
  }

  /**
   *  Composes our entire user object that we can query
   *  through a canonical set of promises/resolutions.
   *
   *  REVIEW: This should be a "graph composition", it feels
   *  messy to have this written out canonically.
   */
  function composeUser(id, store) {
    var composedData = {};
    var deferred = $q.defer();

    // query the appropriate services to compose our data
    deferred.resolve(composedData);

    return deferred.promise;
  }

  /**
   *  Returns an existing store.
   *
   *  @param type {Stores::types}
   *  @param id {String}
   *  @param listener {Function}
   *  @return {Store}
   */
  function existingStore(type, id, listener) {
    var existingStore = _stores[id];

    /**
     *  Other listeners may have been bound to the store before all the
     *  data has finished being composed. Therefore, we need to wait
     *  for the data to be composed first (new Store composes the data).
     */
    return _newStoreCompositionPromise.then(function() {
      /**
       *  Store#update can call Store#get without
       *  passing in a listener, so we only need to
       *  patch new listeners to the store if we're
       *  specifically calling Store#get *from a component*.
       */
      if(typeof listener !== 'undefined') {
        patchToStore.call(existingStore, type, listener);

        broadcast.call(existingStore, type);
      }

      return existingStore;
    });
  }

  /**
   *  Returns a singleton Store. If the Store already exists,
   *  then it waits for the data to be composed in the singleton
   *  before returning the existing Store.
   *
   *  @param type {Stores::types}
   *  @param id {String} for example, auth.profile.user_id (to whomever the Store belongs)
   *  @param listener {Function}
   */
  function get(type, id, listener) {
    // broadcast user data in local storage, if it exists
    broadcastCachedData.call(getLocalStorage(id), type, listener);

    // return the existing store, if it exists
    if(id in _stores) {
      return existingStore(type, id, listener);
    } else {
      return new Store(type, id, listener);
    }
  }

  /**
   *  @param id {String} for example, auth0 user_id
   *  @return {Store}
   */
  function getLocalStorage(id) {
    return store.getNamespacedStore('myApplicationStore').get(id);
  }

  /**
   *  Here is where we add our ListenerObjects
   *  to the user's Store. The ListenerObjects can
   *  care either only about a specific segment of the
   *  user's data, or the entire user's Store.
   *
   *  @param type {Stores::types}
   *  @param listener {Function}
   */
  function patchToStore(type, listener) {
    var ListenerObject = function(_type, _listener) {
      this.type = _type;
      this.callback = _listener;
    };
    /**
     *  This part is Angular specific. Because $scope objects
     *  are destroyed if you moved to an uncached view, the listener
     *  that was previously attached to the store may be "stale"
     *  in that it is referring to a dead, or destroyed, $scope.
     *  If that's the case, when the $scope that contains the
     *  listener is re-instantiated, we want to remove the stale
     *  listener and replace it with a fresh listener that refers
     *  to the fresh $scope.
     */
    if(this.listeners.length > 0) {
      // remove dead listeners
      this.listeners.forEach(function(l, i, arr) {
        if(l.callback.toString() === listener.toString()) arr.splice(i, 1);
      });
    }
    
    // push the new ListenerObject
    this.listeners.push(new ListenerObject(type, listener));
  }

  /**
   *  Sets a namespaced storage item.
   *  In this storage, each item will be a Store object,
   *  with the key being the ID to which the Store corresponds.
   *
   *  @param userStore {Store}
   */
  function setLocalStorage(userStore) {
    var storage = store.getNamespacedStore('myApplicationStore');

    storage.set(userStore.id, userStore);
  }

  /**
   *  Queries the appropriate service to update the Store.
   *
   *  If there is an additional target store that needs to be updated,
   *  this method will take care of that as well.
   *
   *  @param type {Stores::types}
   *  @param id {String}
   *  @param data {PlainObject}
   *  @param callback {Function} an optional one-off callback
   */

   // REVIEW: Make DRYer
  function update(type, userId, data, callback) {
    var method = data.method;
    var query = data.query;
    var target = data.foreignUserId;

    get(type, userId).then(function(s) {
      _services[type][method](query).then(function(result) {

        if(type === _types.user) {
          // just push data that changed (we get this from the return value of UserService)
          for(var key in result) {
            // don't need any $-prefixed keys (optimally this should happen at query layer)
            if(key.indexOf('$') < 0) {
              this.data[key] = result[key];
            }
          }
        } else {
          this.data[type] = result;
        }

        /**
         *  This is useful in the case where I initially land on someone else's
         *  profile view, and I click the "follow" button. I need to see *that*
         *  person's "followers" update.
         */
        if(target) {
          // REVIEW: this is an extremely intensive task, and we might not need the entirely
          // composed foreign user all over again... just one segment of that data
          // Maybe just update local data and use a switch ("if follower, update following", etc.)
          return composeUser(target).then(function(result) {
            get(_types.user, target).then(function(foreignStore) {
              foreignStore.data = result;

              broadcast(type, true);
              setLocalStorage(s);
              setLocalStorage(foreignStore);
              if(typeof callback !== 'undefined') callback();
            });
          });
        } else {
          broadcast(type, true)
          setLocalStorage(this);
          if(typeof callback !== 'undefined') callback();
        }
      }.bind(s));
    });
  }
};
