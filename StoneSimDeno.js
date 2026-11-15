import {Window, Image} from "skia-canvas";
import {open} from "@opensrc/deno-open";
import StoneSim from "./StoneSim.js";

const DEBUG = false;
const window = new Window(800, 600);

window.title = "CST Stone Simulator";
window.canvas.background = "black";

window.background = "#050530";

StoneSim({
	window,
	canvas: window.canvas,

	debugMode: DEBUG,
	isDesktop: true,

	requestAnimationFrame(callback) {
		window.once("frame", () => {
			if (!window.closed) callback(performance.now());
		});
	},
	setEventListener(object, event, func) {
		object.on(event, func);
	},
	openLink(url) {
		open(url);
	},
	getAssetUrl(url) {
		const file = Deno.readFileSync(import.meta.dirname + "/" + url);
		return "data:image/png;base64," + file.toBase64();
	},

	Image,
});