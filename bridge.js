var http = require('http');
var webrtc = require('wrtc');
var ws = require('ws');
var express = require('express');
var cookie_parser = require('cookie-parser');
var session = require('express-session')
var now = require('performance-now')
var store = new session.MemoryStore({ reapInterval: 60000 * 10 });

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
};

var pendingDataChannels = {};
var dataChannels = {}
var pendingCandidates = [];

var host = args.h || '0.0.0.0';
var port = args.p || 80;

var app = express();
var server = http.createServer(app);

var ip;
var configuration={};
try {
  var ifs = require('os').networkInterfaces()
  var ips = Object.keys(ifs).map(function(i){return ifs[i].filter(function(x){return x['family'] && x['family']=="IPv4" && !require('ip').isPrivate(x['address'])}).map(function(x){return x["address"]})}).reduce(function(a, b) {return a.concat(b);})
  if (ips.length>1)
    {
	console.log("More than one ips",ips,"creating stun server")
	ip = ips[0]
	var stun = require('stunsrv');
	var stunserver = stun.createServer();
	stunserver.setAddress0(ips[0]);
	stunserver.setAddress1(ips[1]);
	stunserver.setPort0(81);
	stunserver.setPort1(82);
	configuration.stunserver=ip+":"+81
	stunserver.listen();
	console.log("IP1:",ips[0],"IP2:",ips[1])
    }
  else
    {
	console.log("WARNING: Less than 2 public ip addresses configured, using google's stun server")
	configuration.stunserver = "stun.l.google.com:19302"
    }
} catch (err) {
    console.log(err)
    ip = "0.0.0.0"
}

var Cookie_parser = cookie_parser("vurble")

app.use(Cookie_parser)
app.use(session({ store: store, secret: 'vurble', key: 'sid' }));
app.enable("jsonp callback");
app.get('/configure', function(req, res){ 
  // important - you have to use the response.json method
    res.jsonp(configuration);
});
app.use(express.static(__dirname + '/serve'));

server.listen(port, host);
console.log('Server running at http://' + ip + ':' + port + '/');

var wss = new ws.Server({'server': server, 'path':"/ws"});

wss.on('connection', function(ws)
{
  console.info('ws connected',ws.upgradeReq.headers.cookie);
 
  Cookie_parser(ws.upgradeReq, null, function(err) {
      console.log("parsed cookies",ws.upgradeReq.signedCookies)
      var sessionID = ws.upgradeReq.signedCookies['sid'];
      store.get(sessionID, function(err, sess) {
	  console.log("Session:",sess);
      });
      //var sessionID = ws.upgradeReq.headers.cookie['sid'];
      //console.log("sessionid",sessionID);
      //store.get(sessionID, function(err, session) {
      //    console.log("session",session);
      //      // session
      //});
  }); 

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
	    if(obj.t==="p") {
		obj["server_packets"]=packets
		obj["server_time"]=now()
		channel.send(JSON.stringify(obj))		
	    } else if(obj.t==="u")
	    {
		console.log("Game data update",obj)
	    } else 
	    {
		console.log("Unknown packet type",obj)
	    }
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
