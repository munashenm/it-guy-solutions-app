/**
 * Modified Firebase Initialization for Local Backend
 */
(function() {
    console.log("Initializing Local Backend Adapter...");
    
    // Initialize our local handlers to match existing global window symbols
    window.fbDb = window.localDb;
    window.fbAuth = window.localAuth;

    // Simulate "Firebase Initialized" event for other modules
    setTimeout(() => {
        window.dispatchEvent(new Event('firebase-ready'));
        console.log("Local Database Initialized!");
    }, 500);
})();
