chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Message received:", request);

    fetch("https://carrot-upgraded.duckdns.org/contest", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(request.data)
    })
    .then(res => {
        console.log("Fetch status:", res.status);
        return res.json();
    })
    .then(data => {
        console.log("Backend response:", data);
        sendResponse({ success: true, data });
    })
    .catch(err => {
        console.error("Fetch failed:", err);
        sendResponse({ success: false, error: err.toString() });
    });

    return true;
});
