/**
 * Ember Tiny Auth
 *
 * TODO: eventually move this out into it's own code base
 */

'use strict';

var Storage = {};
var Authenticator = {};
var Authorizer = {};


/**
 * Storage base class.
 *
 * @class
 * @abstract
 */
Storage.Base = Ember.Object.extend(Ember.Evented, {
  /**
   * Persist data. You should implement this function to persist the data
   * somehow between requests.
   *
   * @function
   * @abstract
   * @param {object} data Data to persist.
   */
  persist: function(/*data*/) { throw new Error('implement persist'); },

  /**
   * Restore data. You should implement this function to return data that was
   * previously persisted.
   *
   * @function
   * @abstract
   * @return {object} The previously persisted data.
   */
  restore: function() { throw new Error('implement restore'); },

  /**
   * Clear data. You should implement this function to clear data that was
   * previously persisted.
   *
   * @function
   * @abstract
   */
  clear: function() { throw new Error('implement clear'); }
});

Storage.Local = Storage.Base.extend({
  init: function() {
    this._super();
    this._watchStorage();
  },

  persist: function(data) {
    localStorage.setItem('auth-data', JSON.stringify(data));
  },

  restore: function() {
    return JSON.parse(localStorage.getItem('auth-data'));
  },

  clear: function() { localStorage.removeItem('auth-data'); },

  _watchStorage: function() {
    Ember.$(window).on('storage', function() {
      this.trigger('change');
    }.bind(this));
  }
});


/**
 * Authenticator base class.
 *
 * @class
 * @abstract
 */
Authenticator.Base = Ember.Object.extend({
  /**
   * Authenticate a user. This method must be implemented by a concrete
   * subclass of the base authenticator.
   *
   * @function
   * @abstract
   * @param {object} credentials Provided by the application and could vary.
   * Your authenticator should use these values to make a request to the server
   * and authenticate the user.
   * @return {Ember.RSVP.Promise} A promise that, when resolved, indicates that
   * the user has been authenticated and the application can begin to make
   * requests as that user. The data that this promise resolves with will be
   * stored in the session as `sessionData` which can later be used by the
   * authorizer to authorize requests.
   */
  authenticate: function(/*credentials*/) {
    return Ember.RSVP.reject('implement authenticate');
  },

  /**
   * Invalidate a session. This method may be implemented by a concrete
   * subclass of the base authenticator. An implementation, for instance, would
   * allow communicating with the server to invalidate the session or track
   * when a user logs out. Regardless of the server's response, the session
   * data will be cleared on the client side.
   *
   * @function
   * @return {Ember.RSVP.Promise} A promise that, when resolved, indicates that
   * the session has been invalidated. The promise need not be resolved with
   * any value.
   */
  invalidate: function(/*content*/) {
    return Ember.RSVP.resolve();
  }
});


/**
 * Authorizer base class. Base authorizer can be used, but does nothing.
 *
 * @class
 */
Authorizer.Base = Ember.Object.extend({
  /**
   * The session that should be used to store authorization data. This will be
   * set automatically, but you can use it from your implementation of
   * `authorize` in order to access or update the session's `authorizedData`.
   *
   * @type {Session}
   */
  session: function() {
    return this.container.lookup('auth-session:main');
  }.property(),

  /**
   * Setup AJAX requests to authorize users. During the authorization process
   * you can get or set `content` on the session to allow authorization to work
   * across multiple browser sessions.
   *
   * @function
   * @param {jqXHR} jqXHR jQuery XMLHTTPRequest object.
   * @param {object} requestOptions Request options.
   */
  authorize: function(/*jqXHR, requestOptions*/) {
  },

  /**
   * Authorizers can set this value to support session login without requiring
   * invoking the authorize method. This can typically be supported by pulling
   * authorization information out of HTTP response headers when the server's
   * authentication method provides it in the response. The authorizer will not
   * have knowledge of which requests are related to login, though.
   *
   * @type {object}
   */
  capturedAuthorization: undefined,
});

/**
 * Authentication Session. The session acts as a proxy to the underlying
 * content that's stored in the storage. You can therefore access data that's
 * been set on the session (which usually comes from resolution value of
 * Authenticator.prototype.authenticate). The underlying data should be
 * considered read-only. If you need to alter it, consider using
 * Session.prototype.integrateContent.
 *
 * @class
 */
var Session = Ember.ObjectProxy.extend({
  attemptedTransition: null,

  /**
   * @private
   * @type {Object}
   */
  content: {},

  init: function() {
    this._super();
    this._installPrefilter();
  },

  storage: function() {
    var options = this.container.lookup('auth-session-settings:main');
    return this.container.lookup(options.storage);
  }.property(),

  authenticator: function() {
    var options = this.container.lookup('auth-session-settings:main');
    return this.container.lookup(options.authenticator);
  }.property(),

  authorizer: function() {
    var options = this.container.lookup('auth-session-settings:main');
    return this.container.lookup(options.authorizer);
  }.property(),

  /**
   * Whether the user is authenticated.
   *
   * @return {boolean}
   */
  isAuthenticated: function() {
    return Ember.keys(this.get('content')).length > 0;
  }.property('content'),

  /**
   * Authenticate a user. This will result in the authenticator authenticating
   * the user using the given credentials. Successful resolution by the
   * authenticator will result in the resolve value being stored to the
   * configured storage.
   *
   * Once authenticated, you can access the `attemptedTransition` on the
   * session to see if you should redirect the user back to a route they were
   * trying to reach.
   *
   * @param {object} credentials Credentials that will be passed to the
   * authenticator.
   * @return {Ember.RSVP.Promise} A promise indicating wither or not the
   * underlying authenticator succeeded. The resolved value for the promise
   * will match that of what was given by the authenticator.
   */
  authenticate: function(credentials) {
    return this.get('authenticator').authenticate(credentials)
    .then(function(data) {
      this.set('content', data);
      return data;
    }.bind(this));
  },

  /**
   * Login without explicitly invoking the authenticator's `authenticate`
   * method. In order for this to work, the authorizer needs to support
   * capturing authorization data as requests are passed back and forth with
   * the server. This method will throw an exception if the authorizer does not
   * support capturing authorization data.
   *
   * @param {object} data Data to append to the authorization data that will
   * be stored in the session.
   */
  login: function(data) {
    var authorizer = this.get('authorizer');
    var captured = authorizer.get('capturedAuthorization');
    if (!captured) {
      throw new Error('Authorization information not captured by authorizer.');
    }
    this.set('content', Ember.$.extend({}, data, captured));
  },

  /**
   * Invalidate a session. This will result in the authenticator having an
   * opportunity to process invalidation. Session data will be cleared
   * regardless of whether the resulting promise resolves successfully or
   * rejects.
   *
   * @function
   * @return {Ember.RSVP.Promise} A promise indicating whether or not the
   * underlying authenticator succeeded.
   */
  invalidate: function() {
    if (this._invalidate) { return this._invalidate; }
    var clear = function() {
      this.set('content', {});
      this.get('authenticator').set('capturedAuthorization', undefined);
      this.get('storage').clear();
      this._invalidate = undefined;
    }.bind(this);
    return (this._invalidate = this.get('authenticator')
      .invalidate(this.get('content'))
      .then(clear, function(e) { clear(); throw e; }));
  },

  /**
   * Integrate new content. This method integrates the provided content into
   * the session's current content. It will add new values from the provided
   * content and overwrite any values in the current content with those from
   * the provided content. It does so shallowly. You should prefer this method
   * over other ways of merging content.
   *
   * Integration of content will only occur if the session is already
   * authenticated. Otherwise the content will simply be ignored.
   *
   * @function
   * @param {object} content New content values to integrate.
   */
  integrateContent: function(content) {
    if (this.get('isAuthenticated')) {
      this.set('content', Ember.$.extend({}, content, this.get('content')));
    }
  },

  /**
   * Restores the session's content to what's stored in the storage.
   *
   * @function
   */
  restore: function() {
    var storage = this.get('storage');
    var content = storage.restore() || {};
    this.set('content', content);
  },

  /**
   * Restores the session's content and observes changes to the storage as
   * well. Changes to the storage will cause an automatic restore.
   *
   * @function
   * @private
   */
  observeStorage: function() {
    var storage = this.get('storage');
    storage.off('change', this, this.restore);
    storage.on('change', this, this.restore);
  },

  _contentChanged: function() {
    this.get('storage').persist(this.get('content'));
  }.observes('content'),

  _installPrefilter: function() {
    Ember.$.ajaxPrefilter(function(options, originalOptions, jqXHR) {
      if (this.isDestroyed || options.crossDomain) { return; }
      this.get('authorizer').authorize(jqXHR, options);
    }.bind(this));
  }
});


/**
 * Authenticated Route Mixin. This should be used to protect routes that
 * require authentication. This will set the property `attemptedTransition`
 * on the session which you can use from your route that actual performs
 * authentication to transition back to where the user came from.
 *
 * @type Mixin
 */
var AuthenticatedRouteMixin = Ember.Mixin.create({
  beforeModel: function(transition) {
    this._super();
    if (!this.get('session').get('isAuthenticated')) {
      this.get('session').set('attemptedTransition', transition);
      this.transitionTo('login');
    }
  }
});


/**
 * Setup function. Sets up all required functionality for authentication
 * support and makes `session` available on controllers and routes.
 *
 * @function
 * @param {Ember.Container} container
 * @param {Ember.Application} application
 * @param {string} [options.authenticator] Authenticator factory
 * @param {string} [options.authorizer] Authorizer factory
 * @param {string} [options.storage] Storage factory
 */
var setup = function(container, application, options) {
  var opts = Ember.$.extend({}, {
    authenticator: 'auth-session-authenticator:base',
    authorizer: 'auth-session-authorizer:base',
    storage: 'auth-session-storage:local'
  }, options);
  application.register('auth-session-settings:main', opts, { instantiate: false });
  application.register('auth-session:main', Session);
  application.register('auth-session-authenticator:base', Authenticator);
  application.register('auth-session-authorizer:base', Authorizer);
  application.register('auth-session-storage:local', Storage.Local);
  application.inject('controller', 'session', 'auth-session:main');
  application.inject('route', 'session', 'auth-session:main');

  var session = container.lookup('auth-session:main');
  session.restore();
  session.observeStorage();
};

Ember.TinyAuth = {
  setup: setup,
  Storage: Storage,
  Authenticator: Authenticator,
  Authorizer: Authorizer,
  AuthenticatedRouteMixin: AuthenticatedRouteMixin
};

export default Ember.TinyAuth;
