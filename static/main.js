const iceConfiguration = {
    iceServers: [
        { urls: 'stun:stun1.l.google.com:19302' },
    ]
}

const offerOptions = {
    offerToReceiveAudio: 1,
    offerToReceiveVideo: 1
};

let user_path = window.location.pathname
let proto = window.location.protocol === "https:" ? "wss://" : "ws://";
const websocket_addr = proto + document.location.host + "/signal" + user_path
console.log(websocket_addr)

const callButton = document.querySelector('button#callButton');
const hangupButton = document.querySelector('button#hangupButton');
const localVideo = document.querySelector('video#localVideo');
const remoteVideo = document.querySelector('video#remoteVideo');

let localPeerConnection;
let localStream;
let remoteStream;


callButton.onclick = call;
hangupButton.onclick = hangup;

let wconn = new WebSocket(websocket_addr);
wconn.onmessage = async e => {
    let message = JSON.parse(e.data);
    console.log(message);
    if (message.type === "candidate") {
        try {
            await localPeerConnection.addIceCandidate(message.data);
        } catch (e) {
            console.error('Error adding received ice candidate', e);
        }
    } else if (message.type === "answer") {
        await localPeerConnection.setRemoteDescription(message.data);
        localPeerConnection.onicecandidate = e => {
            if (e.candidate) {
                let msg = {
                    type: "candidate",
                    data: e.candidate
                }
                wconn.send(JSON.stringify(msg));
            }
        };
        localPeerConnection.connectionstatechange = e => {
            if (localPeerConnection.connectionState === 'connected') {
                console.log(e);
            }
        }
    } else if (message.type === "offer") {
        await localPeerConnection.setRemoteDescription(message.data);
        const answer = await localPeerConnection.createAnswer();
        await localPeerConnection.setLocalDescription(answer);
        let msg = {
            type: "answer",
            data: answer
        }
        wconn.send(JSON.stringify(msg));
    } else {
        console.log("Unkown message: ", message);
    }
}

wconn.onclose = () => {
    try {
        wconn = new WebSocket(websocket_addr);
    } catch (e) {
        console.log(e)
    }
}

listen();

async function listen() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        localVideo.srcObject = localStream;
    } catch (e) {
        alert(`getUserMedia() error: ${e.name}`);
        return
    }
    localPeerConnection = new RTCPeerConnection(iceConfiguration);
    localPeerConnection.ontrack = e => {
        if (remoteVideo.srcObject !== e.streams[0]) {
            remoteVideo.srcObject = e.streams[0];
        }
    }
    localStream.getTracks().forEach(track => localPeerConnection.addTrack(track, localStream));
}


async function call() {
    try {
        const offer = await localPeerConnection.createOffer(offerOptions);
        await localPeerConnection.setLocalDescription(offer);
        let msg = {
            type: "offer",
            data: offer
        }
        wconn.send(JSON.stringify(msg));
    } catch (e) {
        console.log(`Failed to create session description: ${e.toString()}`);
        return
    }
    localPeerConnection.onicecandidate = e => {
        if (e.candidate) {
            let msg = {
                type: "candidate",
                data: e.candidate
            }
            wconn.send(JSON.stringify(msg));
        }
    };
    localPeerConnection.connectionstatechange = e => {
        if (localPeerConnection.connectionState === 'connected') {
            console.log(e);
        }
    }
}

function hangup() {
    console.log('Ending call');
    localPeerConnection.close();
    localPeerConnection = null;
    listen();
}
