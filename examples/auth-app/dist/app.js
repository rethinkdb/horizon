'use strict'
var horizon = Horizon({
    authType: 'anonymous'
});

const crossOut = (element) => {
    element.setAttribute("style", "text-decoration: line-through; color: grey;");
}

// #1 - Connect to Horizon server

horizon.onReady(() => {
    crossOut(document.querySelector('#connection-success'));
})

horizon.connect();

// #2 - Ensure Github OAuth client_id & client_secret added

fetch("/horizon/auth_methods").then((response) => {
    return response.text();
}).then((json) => {
    const strategies = JSON.parse(json);
    if (strategies.hasOwnProperty('github')) {
        console.log(strategies)
        crossOut(document.querySelector('#github-configured'));
        const login = document.querySelector('#login-button');
        login.disabled = false;
        login.className = login.className.replace('btn-error-outline', 'btn-primary-outline');
    }
})

// #3 - Test OAuth pathing with Github

var horizon = Horizon({
    authType: 'token'
});
horizon.connect()

if (!horizon.hasAuthToken()) {
    console.log("no auth token")
    document.querySelector('#login-button').addEventListener('click', () => {
        console.log('clicked');
        horizon.authEndpoint('github').subscribe((endpoint) => {
            window.location.pathname = endpoint;
        });
    });
} else {
    const user = horizon.currentUser().fetch().forEach((user) => {
        document.querySelector('#success').innerHTML = `
    <div class="col-sm-12">
    <div class="card card-inverse card-success">
        <div class="card-block">
            <h1 class="card-title">Authentication successful <br> Your user ID is ${user.id}</h1>
        </div>
    </div>
    </div> `;
    });
}
