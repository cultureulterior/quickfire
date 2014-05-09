var canvas = document.getElementById('canvas');
var context = canvas.getContext('2d');
window.addEventListener('resize', resizeCanvas, false);
canvas.addEventListener('mousedown', click , false);
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    redraw(); 
}
function click(evt) {  
    server_time = window.performance.now() + 50.0 + configuration.time_offset;
    configuration.channel.send(JSON.stringify({"t":"u","s":server_time,"x":evt.clientX,"y":evt.clientY}));
    console.log("event in 50 milliseconds",server_time,window.performance.now,configuration.time_offset);
}

id_to_circle = {}
configuration.update_data = function(data){
    server_time = window.performance.now() + configuration.time_offset;
    event_server_time = data["d"]["s"]
    event_offset = event_server_time - server_time 
    console.log("updating data for id:",data["d"]["id"],"server_time",server_time,"event_server_time",event_server_time,"event_offset",event_offset)
    setTimeout(function(){
	id_to_circle[data["d"]["id"]]=data["d"]
	resizeCanvas();
    },event_offset)
}
function redraw(){
    Object.keys(id_to_circle).forEach(function(i){
	draw_circle(id_to_circle[i]["x"],id_to_circle[i]["y"])
    })
}				    
function draw_circle(lox,loy){ 
    context.strokeStyle = '#003300';
    context.lineWidth = 5;
    context.lineJoin = 'miter'
    context.beginPath();
    context.arc(lox,loy,50,0,Math.PI*2.0);
    context.closePath()
    context.stroke();
    context.font = '30pt Calibri';
    context.textAlign = 'center';
    //context.fillText('SK',lox,loy+12);
}
resizeCanvas();