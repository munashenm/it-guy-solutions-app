/**
 * Single app version. Server status, the staff footer, and the service
 * worker cache name all read APP_VERSION from here. Keep the ?v= cache
 * query on HTML assets equal to this value when it changes.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.APP_VERSION = api.APP_VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    return { APP_VERSION: '4.9' };
});
