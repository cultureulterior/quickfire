WebRTC Client-Server communications:

Why use webrtc? Unreliable messaging means no more worry about 
- ordering waits in the TCP stack
- packet loss leading to retransmits

Features
- Time interpolator, capable of maintaining offsets within 1ms
- Packet loss information
- Latency information

License: For now, AGPL- though I'm likely going to relax that