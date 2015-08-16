# Store

*Note: this was built based on AngularJS applications, but conceptually it could be extended to all types of applications.*

The purpose of this module is to attempt to solve a very common problem throughout applications: create a single source of truth for data, and propagate changes to that data to components that need it.

This sounds like a very simple task, but there are many roadblocks. For example, in most cases, data is best represented *atomically* on the server, but best represented *composed* on the client. In other words, we want our data as decoupled as possible on the server so that, in theory, any client can consume the data according to the client's composition requirements.

We could simply replicate a composed database on the client, but this will likely cause performance issues (for example, major delays in rendering and taking up too much memory), so this seems impractical.

On the opposite end of the spectrum, we could simply have each component directly query the server for the data it needs, but then this creates a situation where components are all referring separately to the data they need, and this makes it difficult to concurrently propagate changes in the data to each component.

The solution that this module provides is to **incrementally replicate and compose all data on the client that the application needs**.

We can **leverage cache (such as local storage)** to force the application to perform the "heavy lifting" of data composition in the background while the user of the application can still consume potentially stale data. We can also very easily **invoke callbacks in a sort of pubsub implementation** in order to propagate changes to every component that consumes the same data.

In other words, the view layer will always draw data from the cache, and the data in the cache is refreshed in the background. Any changes to the data are then propagated to components when the cache is refreshed.

The components don't know that they're all querying the same object. In other words, each components only needs to know that it requires a specific segment of data, and queries thusly. Here's a practical example of this:

```javascript
var obj = { foo: 'foo', bar: 'bar' };

// component A
var foo = obj.foo;
```

In the above example, `component A` knows that `obj` exists, and it knows that it needs to access a certain property of that object in order to retrieve the data it needs. In other words, *it has a holistic notion of the source of the data*.

If we are to use the approach where a component only knows about a specific segment of data that it requires, we would see a query like this:

```javascript
var store = { foo: 'foo', bar: 'bar' };

// component B
var foo = Stores.get(Stores.types.foo);
```

In other words, `component B` only knows that it requires a specific, typed segment of data. It may seem like a trivial difference, but the important nuance is in the implementation and is benefical for the consumer of this API.

# Has this been solved already?

In some ways, yes. A common method in AngularJS is to hold data in services, and (if the data is async), either query for the data in <a href="https://github.com/johnpapa/angular-styleguide#route-resolve-promises">route resolutions</a> or provide an explicit `$scope.$watch` in controllers to watch the service data.

However, the potential downside to this approach is that 1) it gets "hariy" quickly, and 2) it potentially bloats the digest cycle for components that explicity watch multiple segments of data, and can also appear "wet" (the opposite of DRY) to consumers of the API.

For example:

```javascript
$scope.$watch(function() {
  return asyncService.get();
}, function(newVal) {
  $scope.myData = newVal;
});

$scope.$watch(function() {
  return someOtherAsyncService.get();
}, function(newVal) {
  $scope.myOtherData = newVal;
});
```

In other words, every time a digest cycle occurs, it forces calls to our server. Instead, what we want is for calls to our server only to happen when we need them to, and push changes to the components, rather than the other way around.

# Layers

This implementation requries two layers. The bottom-most layer (closest to the server) is our **query layer**. The implementation of this is left up to the consumer of this API, as it differs depending on how the data is composed on the server. However, there are some requirements to keep in mind (we'll go into further detail later on):

1. **Updates to specific segments of data should return the entire updated set of that segmented data to the store layer**. For example, we have two query services: `WishService` and `UserService`. `WishService` handles adding or removing an item from the user's wishlist. When calling `add` or `remove`, `WishService` should return the entire updated set of `wishes`, which will then be patched to the data we have in our cache on the client. If we make a call to `UserService` (say, to update the user's email), the user's updated email should then be returned to the store layer to be patched to the cache on the client. In other words, **every update that happens at the query layer should return the updated data back to the store**. This seems trivial, but there are many conventions for this type of implementation already in use. For example, some APIs will paradigmatically return only the item that was updated or removed, and not the updated set.

2. **No component should ever query the query layer directly. Only the store should query the query layer.** This ensures consistency in updates to data, and it also ensures that all handling of data is routed always 1) directly between the store layer and query layer, and 2) directly between the store layer and the cache, and 3) directly between the cache and the components. In other words, it creates a "single-lane" avenue of data, with no branches possible that may otherwise affect data propagation, etc.

3. **No updates or requests should happen outside the context of this implementation**. In other words, the query layer should act as a proxy to all requests that may happen to foreign APIs. For example, in the context of AngularJS, no component should every call `$http.get('http://www.someotherdomain.com/api')` from a controller, directive, etc. Instead, that request should be routed through the store layer and query layer to leverage all the benefits of this implementation (i.e., live updates in data progagating to components, the leveraging of cache, etc.)

The second layer is the **store layer**. This is the layer provided by this implementation. It handles the following:

1. Interacting with the query layer (which is implemented by the consumer of this API)

2. Interacting with the cache

3. Propagating changes in data to components

# How the data looks

On the server, we might be using the <a href="https://en.wikipedia.org/wiki/Entity%E2%80%93attribute%E2%80%93value_model">EAV data model</a>. Thus, our data is said to be "atomic", more or less:

```
batman:color:black
batman:firstname:bruce
batman:lastname:wayne
```

However, we don't want the data like that on the client. We want an entirely composed set of data that the application can efficiently use:

```javascript
var Batman = {
  color: 'black',
  firstName: 'Bruce',
  lastName: 'Wayne'
};
```

Thus, if we need those three properties of Batman in one of our controllers, we don't want to have to continually compose that data over and over (we don't want to keep making round-trips to the server):

```javascript
// we don't want this

$scope.batman = {};

ColorService.get('batman').then(function(color) {
  $scope.batman.color = color;

  NameService.get('batman').then(function(name) {
    $scope.batman.firstName = name.first;
    $scope.batman.lastName = name.last;
  });
});
```

But, we also don't want to query for a tidal wave of composed data which we may or may not require at the moment, as this bloats our application memory unnecessarily.

```javascript
// we don't want this either

UserService.get('batman').then(function(batman) {
  $scope.batman = batman;
});

console.log($scope.batman.socialSecurityNumber);
console.log($scope.batman.underwearColor);
```

All of this should not be happening in the components. Data-access permissions should be taken care of elsewhere (on the server), and composition of specific data should happen outside the context of the component. In other words, a component should only need to care of the specific piece of data it requires.

```javascript
// we want something like this

Stores.get(Stores.types.basicInfo, 'batman', function(batman) {
  $scope.batman = batman;
});

console.log($scope.batman);

/**
 *  { color: 'black', firstName: 'Bruce', lastName: 'Wayne' }
 */
```

`Stores` has a notion of "types" of data (in this case, `Stores.types.batman`), and will propagate initial data from cache and all subsequent changes in that data to the component. The component, therefore, does not need to worry about composing that data itself. All it cares about is querying for that specific segment, or "type", of data that it requires.

In other words, our API uses a `datatype:entity` model to represent "segments" of data from a specific entity.

In a more functional syntax: `Data: ofType` from a specific entity (in our case, perhaps a user ID, or name, such as `batman`).

# Updates

Each service in the query layer may have unique query schemas and methods. For example, a `WishService` may have only the methods `query`, `add`, and `remove`.

However, the entire `UserService` may have methods `query`, `updateEmail`, `changeName`.

The consistent paradigm, however, is that every method that *updates* data should return the applicable updated set of data. For example:

```javascript
UserService.updateEmail(); // => returns the updated email
WishService.add(); // => returns the entire updated set of items in the wishlist
```

When we call `Stores.update`, we use a "pass-through" implementation for our methods. In other words, the query and method is simply passed through the store layer to the query layer:

```javascript
// Stores.types.wishlist is mapped to the WishService
Stores.update(Stores.type.wishlist, id, {
  method: 'add',
  query: assetId // the thing we're adding to our wishlist
});
```

The method and query are simply passed directly through to the `WishService`, with the stores acting as a proxy so that it knows to receive data *back* from the query layer, update cache, and propagate changes in data accordingly.

# Performance

When we are only viewing a component that requires data about, say, a wishlist, it does not make sense to force that view to stop rendering while we load an entire set of user data that the view doesn't require. In other words, we **incrementally compose the store data over time and place it in the cache**. This is essentially an implementation of "lazy-loading".

<hr>

The MIT License (MIT)

Copyright (c) 2015 Joshua Beam
