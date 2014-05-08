var static = require('node-static-alias');
var http = require('http');
var webrtc = require('wrtc');
var ws = require('ws');

var args = require('minimist')(process.argv.slice(2));
var MAX_REQUEST_LENGHT = 1024;
var pc = null;
var offer = null;
var answer = null;
var remoteReceived = false;

var dataChannelSettings = {
  'reliable': {
        ordered: false,
        maxRetransmits: 0
      },
  /*
  'reliable': {},
  '@control': {
        outOfOrderAllowed: true,
        maxRetransmitNum: 0
      }
  */
};

var pendingDataChannels = {};
var dataChannels = {}
var pendingCandidates = [];

var host = args.h || '0.0.0.0';
var port = args.p || 80;
var socketPort = args.ws || 9001;

var file = new static.Server('./serve')
var app = http.createServer(function (req, res) {
    console.log(req.url);
    req.addListener('end', function() {
        file.serve(req, res);
      }).resume();
}).listen(port, host);

console.log('Server running at http://' + host + ':' + port + '/');

var wss = new ws.Server({'port': 9001});
wss.on('connection', function(ws)
{
  console.info('ws connected');
  function doComplete()
  {
    console.info('complete');
  }

  function doHandleError(error)
  {
    throw error;
  }

  function doCreateAnswer()
  {
    remoteReceived = true;
    pendingCandidates.forEach(function(candidate)
    {
      pc.addIceCandidate(new webrtc.RTCIceCandidate(candidate.sdp));
    });
    pc.createAnswer(
      doSetLocalDesc,
      doHandleError
    );
  };

  function doSetLocalDesc(desc)
  {
    answer = desc;
    console.info(desc);
    pc.setLocalDescription(
      desc,
      doSendAnswer,
      doHandleError
    );
  };

  function doSendAnswer()
  {
    ws.send(JSON.stringify(answer));
    console.log('awaiting data channels');
  }

  var packets=0;

  function doHandleDataChannels()
  {
    var labels = Object.keys(dataChannelSettings);
    pc.ondatachannel = function(evt) {
      var channel = evt.channel;

      console.log('ondatachannel', channel.label, channel.readyState);
      var label = channel.label;
      pendingDataChannels[label] = channel;
      channel.binaryType = 'arraybuffer';
      channel.onopen = function() {
        console.info('onopen');
        dataChannels[label] = channel;
        delete pendingDataChannels[label];
        if(Object.keys(dataChannels).length === labels.length) {
          doComplete();
        }
      };
      channel.onmessage = function(evt) {
        var data = evt.data;
        //console.log('onmessage:', evt.data);
        if('string' == typeof data) {
	  packets +=1;
	  obj = JSON.parse(data)
	  obj["server_packets"]=packets
          channel.send(JSON.stringify(obj))
        } else {
          var response = new Uint8Array([107, 99, 97, 0]);
          channel.send(response.buffer);
        }
      };
      channel.onclose = function() {
        console.info('onclose');
      };
      channel.onerror = doHandleError;
    };
    doSetRemoteDesc();
  };

  function doSetRemoteDesc()
  {
    console.info(offer);
    pc.setRemoteDescription(
      offer,
      doCreateAnswer,
      doHandleError
    );
  }

  ws.on('message', function(data)
  {
    data = JSON.parse(data);
    if('offer' == data.type)
    {
      offer = new webrtc.RTCSessionDescription(data);
      answer = null;
      remoteReceived = false;

      pc = new webrtc.RTCPeerConnection(
        {
          iceServers: [{url:'stun:stun.l.google.com:19302'}]
        },
        {
          'optional': [{DtlsSrtpKeyAgreement: false}]
        }
      );
      pc.onsignalingstatechange = function(state)
      {
        console.info('signaling state change:', state);
      }
      pc.oniceconnectionstatechange = function(state)
      {
        console.info('ice connection state change:', state);
      }
      pc.onicegatheringstatechange = function(state)
      {
        console.info('ice gathering state change:', state);
      }
      pc.onicecandidate = function(candidate)
      {
        ws.send(JSON.stringify(
          {'type': 'ice',
           'sdp': {'candidate': candidate.candidate, 'sdpMid': candidate.sdpMid, 'sdpMLineIndex': candidate.sdpMLineIndex}
          })
        );
      }
      doHandleDataChannels();
    } else if('ice' == data.type)
    {
      if(remoteReceived)
      {
        pc.addIceCandidate(new webrtc.RTCIceCandidate(data.sdp.candidate));
      } else
      {
        pendingCandidates.push(data);
      }
    }
  });
});
