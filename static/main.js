const iceConfiguration = {
    iceServers: [
        { urls: 'stun:stun1.l.google.com:19302' },
    ]
}

const offerOptions = {
    offerToReceiveAudio: 1,
    offerToReceiveVideo: 1
};

const videoOptions = {
    video: true,
    audio: true
}
const qvgaConstraints = {
    video: { width: { exact: 320 }, height: { exact: 240 } },
    audio: true
};

const vgaConstraints = {
    video: { width: { exact: 640 }, height: { exact: 480 } },
    audio: true
};

const local_user = crypto.randomUUID();
console.log(local_user);

let user_path = window.location.pathname
let proto = window.location.protocol === "https:" ? "wss://" : "ws://";
const websocket_addr = proto + document.location.host + "/signal" + user_path + "?user=" + local_user
console.log(websocket_addr)

const peers = {}

const leaveButton = document.querySelector('button#leaveButton');
const localVideo = document.querySelector('video#localVideo');
let videoContainer = document.querySelector('div#container');

let localStream;

leaveButton.onclick = leave;
let wconn = new WebSocket(websocket_addr);
wconn.onopen = async (e) => {
    await getMedia();
    wconn.send(JSON.stringify({ type: "join", from: local_user, data: "", to: "*" }));
}
wconn.onmessage = async (e) => {
    let message = JSON.parse(e.data);
    let typ = message.type;
    let peer = message.from;
    let val = message.data;
    console.log(message);
    if (typ === "left") {
        videoContainer.removeChild(peers[peer].vid);
        delete peers[peer].local;
    } else if (typ === "join") {
        peers[peer] = {};
        peers[peer].local = new RTCPeerConnection(iceConfiguration);
        peers[peer].vid = createRemoteVideoElement(peer);
        videoContainer.appendChild(peers[peer].vid);
        peers[peer].local.ontrack = e => {
            if (peers[peer].vid.srcObject !== e.streams[0]) {
                peers[peer].vid.srcObject = e.streams[0];
            }
        }
        localStream.getTracks().forEach(track => peers[peer].local.addTrack(track, localStream));

        try {
            const offer = await peers[peer].local.createOffer(offerOptions);
            await peers[peer].local.setLocalDescription(offer);
            let msg = {
                type: "offer",
                data: offer,
                from: local_user,
                to: peer
            }
            wconn.send(JSON.stringify(msg));
        } catch (e) {
            console.log(`Failed to create session description: ${e.toString()}`);
            return
        }
        peers[peer].local.connectionstatechange = e => {
            if (peers[peer].local.connectionState === 'connected') {
                console.log(e);
            }
        }
    } else if (typ === "candidate") {
        try {
            await peers[peer].local.addIceCandidate(val);
        } catch (e) {
            console.error('Error adding received ice candidate', e);
        }
    } else if (typ === "answer") {
        await peers[peer].local.setRemoteDescription(val);
        peers[peer].local.onicecandidate = e => {
            if (e.candidate) {
                let msg = {
                    type: "candidate",
                    data: e.candidate,
                    from: local_user,
                    to: peer
                }
                wconn.send(JSON.stringify(msg));
            }
        };
    } else if (typ === "offer") {
        peers[peer] = {}
        peers[peer].local = new RTCPeerConnection(iceConfiguration);
        peers[peer].vid = createRemoteVideoElement(peer);
        videoContainer.appendChild(peers[peer].vid);
        peers[peer].local.ontrack = e => {
            if (peers[peer].vid.srcObject !== e.streams[0]) {
                peers[peer].vid.srcObject = e.streams[0];
            }
        }
        localStream.getTracks().forEach(track => peers[peer].local.addTrack(track, localStream));

        peers[peer].local.onicecandidate = e => {
            if (e.candidate) {
                let msg = {
                    type: "candidate",
                    data: e.candidate,
                    from: local_user,
                    to: peer
                }
                wconn.send(JSON.stringify(msg));
            }
        };
        peers[peer].local.connectionstatechange = e => {
            if (peers[peer].local.connectionState === 'connected') {
                console.log(e);
            }
        }
        await peers[peer].local.setRemoteDescription(val);
        const answer = await peers[peer].local.createAnswer();
        await peers[peer].local.setLocalDescription(answer);
        let msg = {
            type: "answer",
            data: answer,
            from: local_user,
            to: peer
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

async function getMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia(qvgaConstraints);
        localVideo.srcObject = localStream;
    } catch (e) {
        alert(`getUserMedia() error: ${e.name}`);
        leave();
    }
}

function createRemoteVideoElement(peer) {
    peerVideo = document.createElement('video');
    peerVideo.id = peer;
    peerVideo.autoplay = true;
    peerVideo.controls = true;
    // peerVideo.playsingleline = true;
    peerVideo.load();
    videoContainer.appendChild(peerVideo);
    return peerVideo;
}

window.onbeforeunload = (e) => {
    leave();
    return false;
}

function leave() {
    let msg = {
        type: "left",
        from: local_user,
        to: "*"
    }
    wconn.send(JSON.stringify(msg));
    console.log('Ending call');
    window.location = window.location.origin;
}
