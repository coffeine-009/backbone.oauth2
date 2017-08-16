/**
 * Copyright (c) 2014-2015, Coffeine Inc
 *
 * @author Vitaliy Tsutsman <vitaliyacm@gmail.com>
 *
 * @date 27/12/2015 2:35 PM
 */

import { Model } from 'backbone/backbone';
import _ from 'underscore/underscore';

/**
 * Model for work with OAuth2 protocol via backbone.
 *
 * @class OAuth2
 */
export default class OAuth2 extends Model {

    constructor(attributes, options) {

        super(attributes, options);

        /**
         * The key used for localStorage
         *
         * @type String
         */
        this.STORAGE_KEY = '__oauth2';

        /**
         * @type Storage
         */
        this.storage;

        /**
         * Has client localStorage support
         */
        var hasLocalStorageSupport = function () {
            try {
                return 'localStorage' in window && window['localStorage'] !== null;
            } catch (e) {
                return false;
            }
        };

        this.accessUrl = options.accessUrl || '/oauth/token';
        this.refreshUrl = options.refreshUrl ||  '/oauth/token';
        this.revokeUrl = '/oauth/token';
        this.grantType = 'password';
        this.clientId = null;
        this.clientSecret = null;

        /**
         * Create localStorage
         */
        if (hasLocalStorageSupport()) {
            this.storage = window.localStorage;
        } else {
            this.storage = {
                setItem: function () {
                    console.warning('backbone.oauth2: Localstorage not available: create failed');
                },
                removeItem: function () {
                    console.warning('backbone.oauth2: Localstorage not available: removal failed');
                }
            }
        }

        /**
         * Set current state object to null. This object is later used to
         * store the last response object from either an valid or invalid
         * authentication attempt.
         *
         * Example:
         * {
         *   "access_token": "52d8670532483516dbe1dfc55d3de2b148b63995",
         *   "expires_in": "2419200",
         *   "token_type": "bearer",
         *   "scope": null,
         *   "time": null,
         *   "refresh_token": "be4b157c57bfbd79f0183b9ebd7879326d080ad8"
         * }
         *
         * @type {object}
         */
        this.state = {
            access_token: null,
            refresh_token: null,
            token_type: null,
            expires_in: null,
            scope: null,
            time: null
        };
        this.load();

        //- Schedule refresh access token -//
        setTimeout(
            () => {
                //- Refresh access token -//
                this.refresh();
            },
            this.expiresIn()
        );

        /*
         * Invoke initialize method
         */
        super(arguments);

        this.set('auth', this.isAuthenticated());
    }

    setClientId(id) {
        this.clientId = id;
    }

    setClientSecret(secret) {
        this.clientSecret = secret;
    }

    /**
     * Verify if the current state is "authenticated".
     *
     * @returns {Boolean}
     */
    isAuthenticated() {
        // Always load
        this.load();

        // Check for expired access_token
        var time = new Date().getTime();

        if (typeof this.state !== 'undefined' && this.state !== null) {
            // Check if token has already expired
            if (this.state.expires_in + this.state.time > time) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get epxiration time for the access-token. This method should be used to
     * request a new access-token after ~50% of the access-token lifetime.
     * This method always returns a positive integer or 0 if not authenticated.
     *
     * @returns {int} Seconds until access-token will be expired
     */
    expiresIn() {
        if (this.isAuthenticated()) {
            var time = new Date().getTime();
            return (this.state.time + this.state.expires_in) - time;
        }
        return 0;
    }

    /**
     * Capitalizes a given string in order to return the correct name for the
     * token type.
     *
     * @param {string} str
     * @returns {string}
     */
    getNormalizedTokenType(str) {
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    /**
     * Returns the full authorization header
     *
     * @returns {object}
     */
    getAuthorizationHeader() {
        if (this.isAuthenticated()) {
            return {
                'authorization': this.getNormalizedTokenType(this.state.token_type) + ' ' + this.state.access_token
            };
        }
        throw 'Unauthorized, please use access() to authenticate first';
    }

    /**
     * Get value for STORAGE_KEY from localStorage
     *
     * @returns {object,boolean}
     */
    load() {
        // Load
        this.state = JSON.parse(this.storage.getItem(this.STORAGE_KEY));

        return this.state;
    }

    /**
     * Save state with STORAGE_KEY to localStorage
     *
     * @param {object} state
     * @returns {void}
     */
    save(state) {
        // Save
        this.state = state;
        this.storage.setItem(this.STORAGE_KEY, JSON.stringify(state));
        this.set('auth', this.isAuthenticated());
    }

    /**
     * Clear value assigned to STORAGE_KEY from localStorage
     *
     * @returns {void}
     */
    clear() {
        this.state = null;
        if (this.storage.getItem(this.STORAGE_KEY)) {
            this.storage.removeItem(this.STORAGE_KEY);
        }
        this.set('auth', this.isAuthenticated());
    }

    /**
     * Authenticate
     *
     * @returns {void}
     */
    auth() {
        if (this.isAuthenticated()) {
            return this.trigger('access', this.state, this);
        }
        this.trigger('error', this.state, this);
    }

    /**
     * Sign In.
     */
    signIn() {
        this.access( this.get( 'username' ), this.get( 'password' ) );
    }

    /**
     * Sign Out
     */
    signOut() {
        this.clear();//FIXME: remove this when server support revoke
        this.revoke();
    }

    /**
     * Authenticates against an OAuth2 endpoint
     *
     * @param {string} code         One time code.
     * @param {string} redirectUrl  URL to redirect.
     */
    access(code, redirectUrl) {

        // Check if we have already authenticated
        if (this.isAuthenticated()) {
            return this.trigger('success', this.state, this);
        }

        /*
         * Save time before request to avoid race conditions with expiration timestamps
         */
        var time = new Date().getTime();

        // Request a new access-token/refresh-token
        Backbone.ajax({
            url: this.accessUrl,
            type: 'POST',
            data: _.extend(this.attributes, {
                grant_type: 'authorization_code',
                client_id: this.clientId,
                client_secret: this.clientSecret,
                code: code,
                redirect_uri: redirectUrl
            }),
            dataType: 'json',

            /**
             * Success event, triggered on every successfull
             * authentication attempt.
             *
             * @param {object} response
             */
            success: (response) => {
                /*
                 * Extend response object with current time
                 */
                response.time = time;

                // Cast expires_in to Int and multiply by 1000 to get ms
                response.expires_in = parseInt(response.expires_in) * 1000;

                // Store to localStorage too(to avoid double authentication calls)
                //self.create(response, response.expires_in - timediff);
                this.save(response);
                this.trigger('success', response, this);
            },

            /**
             * Error event, triggered on every failed authentication attempt.
             *
             * @param {object} response
             */
            error: (response) => {
                this.trigger('error', this, response, this.options);
            }
        });
    }

    /**
     * Request a new access_token and request_token by sending a valid
     * refresh_token
     *
     * @returns {void}
     */
    refresh() {
        //- Log -//
        console.info('A new access-token/refresh-token has been requested.');

        // Load
        if ( this.state.refresh_token === null ) {
            return this.trigger('error', 'No authentication data found, please use the access method first.', this);
        }

        /*
         * Save time before request to avoid race conditions with expiration
         * timestamps
         */
        var time = new Date().getTime();

        // Request a new access-token/refresh-token
        Backbone.ajax({
            url: this.refreshUrl,
            type: 'POST',
            headers: this.getAuthorizationHeader(),
            dataType: 'json',
            data: {
                grant_type: 'refresh_token',
                client_id: this.clientId,
                client_secret: this.clientSecret,
                refresh_token: this.state.refresh_token
            },

            /**
             * Success event, triggered on every successfull
             * authentication attempt.
             *
             * @param {object} response
             */
            success: (response) => {
                /*
                 * Extend response object with current time
                 * Get timediff before and after request for localStorage
                 */
                response.time = time;

                // Cast expires_in to Int and multiply by 1000 to get ms
                response.expires_in = parseInt(response.expires_in) * 1000;

                // Store to localStorage too(faster access)
                this.save(response);
                this.trigger('refresh', response, this);
            },

            /**
             * Error event, triggered on every failed authentication attempt.
             *
             * @param {object} response
             */
            error: (response) => {
                this.trigger('failure', this, response, this.options);
            }
        });
    }

    /**
     * Revoke OAuth2 access if a valid token exists and clears related
     * properties (access_token, refresh_token)
     *
     * @returns {void}
     */
    revoke() {
        // Store a reference to the object
        var self = this;

        /*
         * If we are not authenticated, just clear state property
         */
        if (!this.isAuthenticated()) {
            self.clear();
            return self.trigger('revoke', null, this);
        }

        // Build header
        var accessToken = this.state.access_token;

        // Request a new access-token/refresh-token
        Backbone.ajax({
            url: self.revokeUrl,
            type: 'POST',
            dataType: 'text', // Force text, maybe someone tries to be cool and set application/json with no content
            data: {
                token: accessToken,
                token_type_hint: 'access_token'
            },
            headers: this.getAuthorizationHeader(),

            /**
             * Success event, triggered on every successfull
             * revokation attempt.
             *
             * @param {object} response
             * @returns {void}
             */
            success: function (response) {
                self.clear();
                self.trigger('revoke', response, this);
            },

            /**
             * Error event, triggered on every failed authentication attempt.
             *
             * @param {object} xhr
             * @param {object} ajaxOptions
             * @param {object} thrownError
             * @returns {void}
             */
            error: function (xhr, ajaxOptions, thrownError) {
                self.trigger('error', xhr, this);
            }
        });
    }
}
