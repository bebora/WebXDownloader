const REGEX = /^https?:\/\/(.+?)\.webex\.com\/(?:recordingservice|webappng)\/sites\/([^\/]+)\/.*?([a-f0-9]{32})[^\?]*(\?.*)?/g;
const MATCH = REGEX.exec(location.href);
const SUBDOMAIN = MATCH[1];
const SITENAME = MATCH[2];
const RECORDING_ID = MATCH[3];
const AUTH_PARAMS = MATCH[4];
var API_URL = `https://${SUBDOMAIN}.webex.com/webappng/api/v1/recordings/${RECORDING_ID}/stream`;
var PASSWORD;
var API_RESPONSE = -1;

if (AUTH_PARAMS) API_URL += AUTH_PARAMS;

/**
 * Create the download button to add to the Webex video page.
 * @param {string} downloadURL URL of the video to download.
 * @param {string} savepath Path where save the recording.
 */
function createDownloadButton(downloadURL, savepath) {
    // Create the button
    const i = document.createElement("i");
    i.setAttribute("title", "Download");
    i.setAttribute("tabindex", "0")
    i.setAttribute("role", "button");
    i.setAttribute("id", "playerDownload");
    i.setAttribute("aria-label", `Download recording: ${savepath}`);
    i.classList.add("icon-download", "recordingDownload");

    // Add the onClick and onKeyPress events
    const downloadMessage = {
        downloadURL: downloadURL,
        savepath: savepath
    };
    i.addEventListener("click", () => chrome.runtime.sendMessage(downloadMessage));
    i.addEventListener("keypress", () => chrome.runtime.sendMessage(downloadMessage));

    return i;
}

/**
 * Process a JSON-formatted response obtained from a WebEx page.
 */
function parseParametersFromResponse(response) {
    // Alias used to centralize response values
    const streamOption = response["mp4StreamOption"];

    // Get the data we need to get the video stream
    const host = streamOption["host"];
    const recordingDir = streamOption["recordingDir"];
    const timestamp = streamOption["timestamp"];
    const token = streamOption["token"];
    const xmlName = streamOption["xmlName"];
    const playbackOption = streamOption["playbackOption"];

    // Get the name of the recording
    const recordName = response["recordName"];

    return {
        host,
        recordingDir,
        timestamp,
        token,
        xmlName,
        playbackOption,
        recordName
    }
}

function composeStreamURL(params) {
    const url = new URL("apis/html5-pipeline.do", params.host);
    url.searchParams.set("recordingDir", params.recordingDir);
    url.searchParams.set("timestamp", params.timestamp);
    url.searchParams.set("token", params.token);
    url.searchParams.set("xmlName", params.xmlName);
    url.searchParams.set("isMobileOrTablet", "false");
    url.searchParams.set("ext", params.playbackOption);

    return url;
}

function composeDownloadURL(params, filename) {
    const url = new URL("apis/download.do", params.host);
    url.searchParams.set("recordingDir", params.recordingDir);
    url.searchParams.set("timestamp", params.timestamp);
    url.searchParams.set("token", params.token);
    url.searchParams.set("fileName", filename);

    return url;
}

function sanitizeFilename(filename) {
    const allowedChars = /[^\w\s\d\-_~,;\[\]\(\).]/g;
    return filename.replaceAll(allowedChars, "_");
}

/**
 * Callback used by a MutationObserver object in a
 * WebEx page containing a registration to download.
 */
function mutationCallback(_mutationArray, observer) {
    // Check if the change is the one we want
    // Otherwise it returns (fast fail)
    const playButtons = document.getElementsByClassName("recordingTitle"); // Recording title
    if (!playButtons.length) return;

    // Disconnect this observer to avoid
    // triggering the DOM change detection event
    observer.disconnect();

    chrome.runtime.sendMessage({
            fetchJson: API_URL,
            password: PASSWORD
        },
        (response) => {
            // Save the response from the page
            API_RESPONSE = response;

            // Get the useful parameters from the received response
            const params = parseParametersFromResponse(response);

            // Compose the URL from which to get the video stream to download
            const streamURL = composeStreamURL(params);

            // Add the download button
            chrome.runtime.sendMessage({
                    fetchText: streamURL.toString()
                },
                (text) => addDownloadButtonToPage(text, params));
        }
    )
}

/**
 * Add the download button to the video viewer bar.
 * @param {string} text 
 */
function addDownloadButtonToPage(text, params) {
    // Do not add the button if already present
    const downloadButtons = document.getElementsByClassName("icon-download")
    if (downloadButtons.length) return;

    // Extract the filename of the video
    const parser = new window.DOMParser();
    const data = parser.parseFromString(text, "text/xml");
    const filename = data.getElementsByTagName("Sequence")[0].textContent;

    // Set the recording name as the save name
    const savename = `${sanitizeFilename(params.recordName)}.mp4`;

    // Compose the download link of the video
    const downloadURL = composeDownloadURL(params, filename);
    
    // Create the download button
    const downloadButton = createDownloadButton(downloadURL.toString(), savename);

    // Get the buttons on the viewer bar and add the download button
    const titleDivs = document.getElementsByClassName('recordingHeader');
    titleDivs[0].appendChild(downloadButton);
};

// Add a listener used to receive the password for the WebEx account
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.recPassword) PASSWORD = request.recPassword;
    if (request.apiResponse) sendResponse(API_RESPONSE);
});

// Create an observer for the DOM
const observer = new MutationObserver(mutationCallback);

observer.observe(document.body, {
    childList: true,
    subtree: true
});
