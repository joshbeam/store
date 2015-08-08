/**
 *  The purpose of this is to provide a global "bucket" of user data
 *  (which we call a Store) to the application. The Store
 *  has several responsibilities:
 *
 *  1) Interact with a service layer that queries our server,
 *  2) Broadcast updates with segmented data to components which
 *     require those segments of data.
 *
 *  The data can exist however it needs to on the server. It is
 *  composed into a specifically formatted user object, so components
 *  that need the data do not need to know how the data exists on the
 *  server. The components only need to know how the data exists in the
 *  Store.
 *
 *  The Store acts as sort of an intermediary between components and
 *  the server. In other words, components never needs to query and 
 *  subsequently compose data from the server themselves; they only
 *  need to ask the store either for:
 *
 *  1) The entire set of composed user data,
 *  2) Or, individual segments of that data (for example,
 *     a user's wishlist or followers count).
 *
 *  For example, if we have a view that shows a user's profile,
 *  the component may ask for the entire user profile.
 *  However, if we have another view that shows only followers and
 *  allows you to add a follower, that view will only receive
 *  the segment of data (the follower count) from the Store. But when
 *  that follower view updates that data, the updates in the data
 *  will *still* propagate to the view that needs the entire user
 *  profile. In other words, the profile view own't have to ask
 *  the store for *only* the follower count when it was changed.
 *  Instead, the follower count "segment of data" will be pushed
 *  to the profile component/view without needing to refresh the
 *  entire profile data set.
 */

/**
 *  Mock HTTP backend
 */
var composeUserDataFromServer = function(id) {
  return {
    then: function(callback) {
      return callback({
        id: id,
        wishlist: [
          {
            brand: 'Armani',
            type: 'Handbag',
            color: 'Brown'
          }
        ],
        followers: +(''+(Math.random() * 1000)).split('.')[0],
        following: +(''+(Math.random() * 1000)).split('.')[0]
      });
    }
  };
};

//////////////////////////////////

var Stores = (function() {
  /**
   *  This is a map that stores each user's data.
   *  It may look like this:
   *  {
   *    1234: {
   *      data: [DataFromServer],
   *      listeners: [ListenerObjects]
   *    }
   *  }
   *
   *  A ListenerObject may look like this:
   *  { type: 'wishlist', callback: Function }
   *
   *  This way, the listener corresponds to a certain
   *  field of DataFromServer, and only cares about that
   *  specific data.
   */
  var _stores = {};
  
  var Store = function(type, id, listener) {
    /**
     *  If we call Stores#get, we must supply a listener,
     *  otherwise there's no reason for it to exists
     *  because it won't update any components.
     */
    if(typeof listener === 'undefined') {
      throw new SyntaxError('A new store requires a listener!');
    }
    
    _stores[id] = this;
    
    this.id = id;
    this.listeners = [];

    /**
     *  Asynchronous call to the server that returns
     *  and composes *all* user data into one whole
     *  object. This way, when components (like controllers)
     *  interact with a Store, the component doesn't necessarily
     *  need to care what the data looks like on the server.
     *  The component simply expects an entire set of user data.
     */
    composeUserDataFromServer(this.id).then(function(data) {
      this.data = data;
      
      /**
       *  Then we'll add the ListenerObjects
       */
      patchToStore.call(this, type, listener);
    }.bind(this));
    
  };
  
  return {
    /**
     *  These types correspond to key names in the
     *  data we expect to get from the server.
     */
    types: {
      user: 'user',
      wishlist: 'wishlist',
      followers: 'followers',
      following: 'following'
    },
    get: get,
    update: function(type, id, val) {
      var store = get(type, id);
      
      /**
       *  This would actually query the store's
       *  corresponding service function that would
       *  make an async update call to the server
       *  and (hopefully) return fresh data. This
       *  data would then be diffed against the current
       *  data in the store, and only update the data
       *  and broadcast the update to the components
       *  if the data is indeed fresh.
       *
       *  A caveat is that if the component actually
       *  requests the entire user Store, then only
       *  the piece of data that was updated in the Store
       *  should still be pushed to that component.
       */
      store.data[type] = val;

      // only broadcast if the data is actually fresh
      console.log('update occured =>');
      broadcast.call(store, type);
    }
  };
  
  function get(type, id, listener) {
    var existingStore;

    if(id in _stores) {
      existingStore = _stores[id];

      /**
       *  Store#update can call Store#get without
       *  passing in a listener, so we only need to
       *  patch new listeners to the store if we're
       *  specifically calling Store#get *from a component*.
       *  
       *  If we're calling Store#update, we're expecting
       *  that the store does already in fact exists,
       *  and that it does in fact already have listeners
       *  attached to it.
       */
      if(typeof listener !== 'undefined') {
        patchToStore.call(existingStore, type, listener);
      }
    }

    /**
     *  Return a singleton store. That is, if the store already
     *  exists, then we'll return that one. Otherwise, we'll
     *  create a new store of user data.
     */
    return existingStore || new Store(type, id, listener);    
  }
  
  /**
   *  This will propagate the data to the components.
   *  TODO: Be able to only send segments of data if the 
   *  component requires the entire user Store.
   */
  function broadcast(type) {  
    this.listeners.forEach(function(l) {
      if(l.type === type) {
        l.callback(this.data[type] || this.data);
      }
    }.bind(this));
  }
  
  /**
   *  Here is where we add our ListenerObjects
   *  to the user's Store. The ListenerObjects can
   *  care either only about a specific segment of the
   *  user's data, or the entire user's Store.
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
    
    // go ahead and broadcast the data to the components
    broadcast.call(this, type);
  }
}());


// controller 1 (we only want my wishes)
(function() {
  var $scope = {};
  
  var id = 12345;
  
  Stores.get(Stores.types.wishlist, id, function(wishes) {
    $scope.wishes = wishes;
    console.log('controller 1 | $scope.wishes', $scope.wishes);
  });
}());

// controller 2 (we only care about my followers)
(function() {
  var $scope = {};
  
  var id = 12345;
  
  Stores.get(Stores.types.followers, id, function(followers) {
    $scope.followers = followers;
    console.log('controller 2 | $scope.followers', $scope.followers);
  });
}());

// controller 3 (2 users, and we want the whole sets of user data)
(function() {
  var $scope = {};
  
  var myId = 12345;
  var otherUserId = 54321;
  
  Stores.get(Stores.types.user, myId, function(user) {
    $scope.me = user;
    console.log('controller 2 | $scope.me', $scope.me);
  });
  
  Stores.get(Stores.types.user, otherUserId, function(user) {
    $scope.otherUser = user;
    console.log('controller 2 | $scope.otherUser', $scope.otherUser);
  });
}());

// controller 4 (we want the other user's following count)
(function() {
  var $scope = {};
  
  var otherUserId = 54321;
  
  Stores.get(Stores.types.following, otherUserId, function(followingCount) {
    $scope.otherUserFollowingCount = followingCount;
    console.log('controller 4 | $scope.otherUserFollowingCount', $scope.otherUserFollowingCount);
  });
}());

/**
 *  Directive 1
 *
 *  This represents a button element.
 *
 *  Here, we'll update my followers count.
 */
(function() {
  var id = 12345;
  
  /**
   *  Here we use a timeout to simulate, say,
   *  a button click that is meant to update the followers.
   */
  setTimeout(function() {
    Stores.update(Stores.types.followers, id, 90000000000);
  }, 2000);
}());
