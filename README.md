# Store

*Note: this was built based on AngularJS applications, but conceptually it could be extended to all types of applications.*

The purpose of this is to provide a global "bucket" of user data
(which we call a Store) to the application. The Store
has several responsibilities:

1. Interact with a service layer that queries our server,

2. Broadcast updates with segmented data to components which
require those segments of data.

The data can exist however it needs to on the server. It is
composed into a specifically formatted user object, so components
that need the data do not need to know how the data exists on the
server. The components only need to know how the data exists in the
Store.

The Store acts as sort of an intermediary between components and
the server. In other words, components never needs to query and 
subsequently compose data from the server themselves; they only
need to ask the store either for:

1. The entire set of composed user data,

2. Or, individual segments of that data (for example,
a user's wishlist or followers count).

For example, if we have a view that shows a user's profile,
the component may ask for the entire user profile.
However, if we have another view that shows only followers and
allows you to add a follower, that view will only receive
the segment of data (the follower count) from the Store. But when
that follower view updates that data, the updates in the data
will *still* propagate to the view that needs the entire user
profile. In other words, the profile view own't have to ask
the store for *only* the follower count when it was changed.
Instead, the follower count "segment of data" will be pushed
to the profile component/view without needing to refresh the
entire profile data set.

# Example

In a controller, we may have the following code that wants the entire set of user data from the Store (i.e., the user's "profile"). This entire user profile would be shown in, say, a profile view:

```javascript
// For example, my Auth0 user profile ID
var myId = auth.profile.user_id;

Stores.get(Stores.types.user, myId, function(user) {
  $scope.me = user;
});
```

Then we might have a view that shows *only* my follower count:

```javascript
Stores.get(Stores.types.followers, myId, function(followers) {
  $scope.followers = followers;
});
```

And finally, a directive (a button) that updates my follower count:

```javascript
// Here, I'll pretend I'm popular and set my follower count to 90,000,000,000
element.on('click', function() {
  Stores.update(Stores.types.followers, myId, 90000000000);
});
```

When that button is clicked, the changes will propagate only to:

1. The controller/view that shows my entire profile, and

2. The controller/view that shows *only* my follower count

# Run it yourself

The example will show various user data belonging to me and to another user, and then will simulate a button click by wrapping `Store#update` in a `setTimeout` function to simulate an asynchronous button click that updates my followers count.

Either:

1. Copy and paste `./index.js` in <a href="http://www.jsbin.com">JS Bin</a> and open your developer console to see the results, or

2. `git clone https://github.com/joshbeam/store; node index.js` to see the output in your terminal

<hr>

The MIT License (MIT)

Copyright (c) 2015 Joshua Beam
