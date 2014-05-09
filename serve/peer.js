(function() {

var bridge = window.location.host + "/ws"

var RTCPeerConnection     = wrtc.RTCPeerConnection;
var RTCSessionDescription = wrtc.RTCSessionDescription;
var RTCIceCandidate       = wrtc.RTCIceCandidate;

var dataChannelSettings = {
  'reliable': {
        outOfOrderAllowed: false,
        maxRetransmitNum: 0,
        ordered:false,
        maxRetransmits:0
      }
};

var pendingDataChannels = {};
var dataChannels = {};
var pendingCandidates = [];

function doHandleError(error)
{
  throw error;
}

var packets=0;
var last_packets={};
var rec_packets=0;

function orbit()
{
  packets += 1;
  last_packets[""+packets] = window.performance.now()
  if(Object.keys(last_packets).length > 20){
      delete last_packets[Math.min.apply(null, last_packets)]
  }
  dataChannels['reliable'].send(JSON.stringify({"client_packets":packets}));
}

function doComplete()
{
  console.log('complete');
  //var data = new Uint8Array([97, 99, 107, 0]);
  //dataChannels['reliable'].send(data.buffer);
  //dataChannels['reliable'].send("WARLORD");
  setInterval(orbit,50)
}

function doWaitforDataChannels()
{
  console.log('awaiting data channels');
}

var ws = null;
var pc = new RTCPeerConnection(
  {
      iceServers: [{url:('stun:'+configuration.stunserver)}]
    // iceServers: [{url:'stun:176.58.96.186:81'}]
    // iceServers: [{url:'stun:stun.l.google.com:19302'}]
  },
  {
    'optional': []
  }
);
pc.onsignalingstatechange = function(event)
{
  console.info("signaling state change: ", event.target.signalingState);
};
pc.oniceconnectionstatechange = function(event)
{
  console.info("ice connection state change: ", event.target.iceConnectionState);
};
pc.onicegatheringstatechange = function(event)
{
  console.info("ice gathering state change: ", event.target.iceGatheringState);
};
pc.onicecandidate = function(event)
{
  var candidate = event.candidate;
  if(!candidate) return;
  if(WebSocket.OPEN == ws.readyState)
  {
    ws.send(JSON.stringify(
      {'type': 'ice',
       'sdp': {'candidate': candidate.candidate, 'sdpMid': candidate.sdpMid, 'sdpMLineIndex': candidate.sdpMLineIndex}
      })
    );
  } else
  {
    pendingCandidates.push(candidate);
  }
};

doCreateDataChannels();
latency = 100;

function doCreateDataChannels()
{
  var labels = Object.keys(dataChannelSettings);
  labels.forEach(function(label) {
    var channelOptions = dataChannelSettings[label];
    var channel = pendingDataChannels[label] = pc.createDataChannel(label, channelOptions);
    channel.binaryType = 'arraybuffer';
    channel.onopen = function() {
      console.info('onopen');
      dataChannels[label] = channel;
      delete pendingDataChannels[label];
      if(Object.keys(dataChannels).length === labels.length) {
        doComplete();
      }
    };
    channel.onmessage = function(event) {
      var data = event.data;
      if('string' == typeof data) {        
	obj = JSON.parse(data)
	  rec_packets +=1
          document.getElementById("diff_packets").textContent = ((1.0 - rec_packets/packets)*100.0).toFixed(3)
	  var last = last_packets[obj["client_packets"]]
	  if(last){
	      latency = (window.performance.now() - last)
              document.getElementById("latency").textContent = latency.toFixed(3)
	  } else {
	      latency = 100;
	      document.getElementById("latency").textContent = "TOO LONG"
	  }
	  //console.log(obj,time,packets)
      } else {
        console.log('onmessage:', new Uint8Array(data));
      }
    };
    channel.onclose = function(event) {
      console.info('onclose');
    };
    channel.onerror = doHandleError;
  });
  doCreateOffer();
}

function doCreateOffer()
{
  pc.createOffer(
    doSetLocalDesc,
    doHandleError
  );
}

function doSetLocalDesc(desc)
{
  pc.setLocalDescription(
    new RTCSessionDescription(desc),
    doSendOffer.bind(undefined, desc),
    doHandleError
  );
}

function doSendOffer(offer)
{
  ws = new WebSocket("ws://" + bridge);
  ws.onopen = function()
  {
    pendingCandidates.forEach(function(candidate)
    {
      ws.send(JSON.stringify(
        {'type': 'ice',
         'sdp': {'candidate': candidate.candidate, 'sdpMid': candidate.sdpMid, 'sdpMLineIndex': candidate.sdpMLineIndex}
        })
      );
    });
    ws.send(JSON.stringify(
      {'type': offer.type, 'sdp': offer.sdp})
    );
  };
  ws.onmessage = function(event)
  {
    data = JSON.parse(event.data);
    if('answer' == data.type)
    {
      doSetRemoteDesc(data);
    } else if('ice' == data.type)
    {
      var candidate = new RTCIceCandidate(data.sdp.candidate);
      pc.addIceCandidate(candidate);
    }
  };
}

function doSetRemoteDesc(desc)
{
  pc.setRemoteDescription(
    new RTCSessionDescription(desc),
    doWaitforDataChannels,
    doHandleError
  );
}

})();
