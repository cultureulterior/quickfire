var canvas = document.getElementById('canvas');
var context = canvas.getContext('2d');
window.addEventListener('resize', resizeCanvas, false);
canvas.addEventListener('mousedown', click , false);
var lox=-100,loy=-100;
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    redraw(); 
}
function click(evt) {
    setTimeout(function(){
	lox=evt.clientX;
	loy=evt.clientY;
	resizeCanvas();
    },latency)
}
function redraw(){ 
    context.strokeStyle = '#003300';
    context.lineWidth = 5;
    context.lineJoin = 'miter'
    context.beginPath();
    context.arc(lox,loy,50,0,Math.PI*2.0);
    context.closePath()
    context.stroke();
}
resizeCanvas();