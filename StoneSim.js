export default function StoneSim({
	window = globalThis,
	canvas,

	debugMode = false,
	isDesktop = false,

	requestAnimationFrame = globalThis.requestAnimationFrame,
	setEventListener = (object, event, func) => {
		object["on" + event] = func;
	},
	openLink = (url) => {
		window.open(url, "_blank");
	},
	getAssetUrl = (url) => url,
	
	Image = globalThis.Image,
}) {
	// the game itself

	const canv = canvas;

	// assets are filled in with Images by the loader
	const assets = {
		player1: 0,
		player2: 0,
		player3: 0,
		player4: 0,
		stone: 0,
	};
	const tile = {
		none: 0,
		tile: 1,
		unbreakable: 2,
	};
		
	// utility functions
	const flr = Math.floor;
	const flrto = function(val, to) {
		return flr(val / to) * to;
	};
	const approach = function(from, to, rate) {
		if (from > to) return Math.max(from - rate, to);
		return Math.min(from + rate, to);
	};
	const sign = function(val) {
		return val > 0 ? 1 : (val < 0 ? -1 : 0);
	};
	const ceil = Math.ceil;

	const sw = 640;
	const sh = 480;
	let gameScale = 1;
	let gameScaleInverse = 1;

	const ctx = canv.getContext("2d");

	let resizedThisFrame = false;
	function resizeGame() {
		if (!debugMode) {
			if (resizedThisFrame) return;
			const w = window.innerWidth || window.width;
			const h = window.innerHeight || window.height;
			if (w / h > sw / sh) {
				gameScale = Math.max(h / sh, 1);
				if (!isDesktop) {
					canv.style.width = "auto";
					canv.style.height = "100%";
				}
			} else {
				gameScale = Math.max(w / sw, 1);
				if (!isDesktop) {
					canv.style.width = "100%";
					canv.style.height = "auto";
				}
			}
			gameScale *= window.devicePixelRatio || 1;
			resizedThisFrame = true;
		}
		canv.width = ceil(sw * gameScale);
		canv.height = ceil(sh * gameScale);
		ctx.msImageSmoothingEnabled = false;
		ctx.imageSmoothingEnabled = false;
		gameScaleInverse = 1 / gameScale;
		draw();
	}


	const buttons = new Set();
	const buttonsJust = new Set();
	const modernKeyToIEKey = {
		arrowup: "up",
		arrowdown: "down",
		arrowleft: "left",
		arrowright: "right",
		" ": "spacebar",
		"space": "spacebar",
		escape: "esc",
		
		// screw it i'll add wasd mappings here
		w: "up",
		a: "left",
		s: "down",
		d: "right",
	};
	const ignoreKeys = {
		"tab": true,
		"f1": true,
		"f2": true,
		"f3": true,
		"f4": true,
		"f5": true,
		"f6": true,
		"f7": true,
		"f8": true,
		"f9": true,
		"f10": true,
		"f11": true,
		"f12": true,
	};
	setEventListener(window, "keydown", function(e) {
		const _key = e.key.toLowerCase();
		const key = modernKeyToIEKey[_key] || _key;
		if (window.document) {
			if (!document.activeElement || (document.activeElement.tagName !== "BODY" && document.activeElement.tagName !== "CANVAS" && document.activeElement.tagName !== "HTML") || ignoreKeys[key]) return;
		}
		if (!pressed(key)) buttonsJust.add(key);
		buttons.add(key);
		if (!e.ctrlKey && !e.altKey) e.preventDefault();
	});
	setEventListener(window, "keyup", function(e) {
		const _key = e.key.toLowerCase();
		const key = modernKeyToIEKey[_key] || _key;
		buttons.delete(key);
	});
	const pressed = buttons.has.bind(buttons);
	const justPressed = buttonsJust.has.bind(buttonsJust);

	// fill an array
	function fill(arr, val) {
		for (let i = 0; i < arr.length; i++) arr[i] = val;
		return arr;
	}
	const TILE_SIZE = 32;
	const GEN_FACTOR = 300;
	const GEN_YOFF = 400;
	let tmh = 200; // tilemap height
	let tmw = 150; // tilemap width
	let gameLength = "Medium";
	let tilemap;
	function genLevel(random) {
		tilemap = fill(new Array(tmh)).map(function(v, i) {
			return fill(new Array(tmw)).map(function() {
				if (random && i > 0) return Math.floor(Math.random() * (i + GEN_YOFF) / GEN_FACTOR) ? tile.tile : tile.none;
				return tile.none;
			});
		});
	}

	const lengthHeights = {
		Tiny: 50,
		Short: 100,
		Medium: 200,
		Long: 250,
		XL: 300,
	};
	const gameTimes = {
		Tiny: 10,
		Short: 30,
		Medium: 70,
		Long: 100,
		XL: 135,
	};
	const gameLengths = Object.keys(lengthHeights);

	// world x, world y
	function tileAt(wx, wy, oobTile) {
		const tx = flr(wx / TILE_SIZE);
		const ty = flr(wy / TILE_SIZE);
		return getTile(tx, ty, oobTile);
	}
	function tileInBounds(tx, ty) {
		if (ty < 0 || ty >= tmh) return false;
		if (tx < 0 || tx >= tmw) return false;
		return true
	}
	function getTile(tx, ty, oobTile) {
		if (!tileInBounds(tx, ty)) return oobTile;
		return tilemap[ty][tx];
	}
	function setTile(tx, ty, tile) {
		if (!tileInBounds(tx, ty)) return undefined;
		return tilemap[ty][tx] = tile;
	}

	const objs = [];
	function Player(timer) {
		this.x = 0;
		this.y = 0;
		this.hsp = -0.1;
		this.vsp = 0;
		this.falling = 0;
		
		this.jumpBuffer = 0;
		this.storedBlocks = 0;
		
		this.facing = 1;
		
		const grav = 1200;
		const accel = 800;
		const decel = 3000;
		const friction = 800;
		const jumpSpeed = -500;
		const maxSpeed = 300;
		const w = 24;
		const h = 24;
		
		if (timer) timer.player = this;
		
		this.step = function(dt) {
			const joystickX = pressed("right") - pressed("left");
			
			if (joystickX !== 0) {
				if (joystickX === -sign(this.hsp))
					this.hsp += joystickX * decel * dt;
				else
					this.hsp += joystickX * accel * dt;
				this.facing = joystickX;
			} else
				this.hsp = approach(this.hsp, 0, friction * dt);
			
			this.vsp += grav * dt;
			this.hsp = Math.min(Math.max(this.hsp, -maxSpeed), maxSpeed);
			
			this.y += this.vsp * dt;
			this.falling += dt;
			if (this.vsp > 0 && (
				tileAt(this.x, this.y + h, tile.unbreakable) ||
				tileAt(this.x + w - 0.01, this.y + h, tile.unbreakable)
			)) {
				this.y = flrto(this.y + h, TILE_SIZE) - h;
				this.vsp = 0;
				this.falling = 0;
			} else if (this.vsp < 0 && tileAt(this.x + w/2, this.y, tile.unbreakable)) {
				this.y = flrto(this.y, TILE_SIZE) + TILE_SIZE;
				this.vsp = 0;
			}
			this.x += this.hsp * dt;
			if (this.hsp <= 0 && tileAt(this.x, this.y + h/2, tile.unbreakable)) {
				this.x = flrto(this.x, TILE_SIZE) + TILE_SIZE;
				this.hsp = 0;
			} else if (this.hsp >= 0 && tileAt(this.x + w, this.y + h/2, tile.unbreakable)) {
				this.x = flrto(this.x + w, TILE_SIZE) - w;
				this.hsp = 0;
			}
			
			if (justPressed("up")) this.jumpBuffer = 0.1;
			if (this.falling <= 0.2 && this.jumpBuffer > 0) {
				this.falling = 999;
				this.jumpBuffer = 0;
				this.vsp = jumpSpeed;
			}
			this.jumpBuffer = approach(this.jumpBuffer, 0, dt);
			
			
			if (justPressed("spacebar")) {
				const tx = flr((this.x + w/2) / TILE_SIZE);
				const ty = ceil((this.y + h/2) / TILE_SIZE);
				if (this.storedBlocks > 0) {
					if (!getTile(tx, ty, tile.unbreakable)) {
						setTile(tx, ty, 1);
						this.storedBlocks--;
					} else if (!getTile(tx, ty - 1, tile.unbreakable) && !getTile(tx, ty - 2, tile.unbreakable)) {
						setTile(tx, ty - 1, 1);
						this.storedBlocks--;
						// snap to the block we just placed
						this.y = (ty - 1) * TILE_SIZE - h;
					}
				} else if (getTile(tx, ty) && this.falling == 0) {
					setTile(tx, ty, 0);
					this.storedBlocks++;
					this.falling = 999;
				}
			}
			
			camX = this.x + w/2 - sw/2;
			camY = this.y + h/2 - sh/2;
			
			if (this.y >= (tmh * TILE_SIZE - h)) {
				objs.splice(objs.indexOf(this), 1);
				if (timer) timer.stopped = true;
				objs.push(new WinText());
			}
		};
		this.draw = function(ctx) {
			if (this.storedBlocks) {
				ctx.drawImage(assets.stone, -4, -26, 32, 32);
			}
			
			let frame = (this.facing === 1 ? 1 : 2);
			if (this.storedBlocks) frame += 2;
			ctx.drawImage(assets["player" + frame], -4, -8, 32, 32);
		};
	}

	function WinText() {
		this.isGUI = true;
		this.draw = function(ctx) {
			ctx.fillStyle = "white";
			ctx.textAlign = "center";
			ctx.textBaseline = "top";
			ctx.font = "bold 64px sans-serif";
			
			ctx.fillText(
				"You Win!",
				sw/2, sh/2-48
			);
			ctx.font = "32px sans-serif";
			ctx.fillText(
				"(Pause -> New Game to restart)",
				sw/2, sh/2+16
			);
		};
	}

	function Timer() {
		this.time = 0;
		this.stopped = false;
		this.isGUI = true;
		this.player = null;
		
		this.step = function(dt) {
			if (!this.stopped) this.time += dt;
		};
		this.draw = function(ctx) {
			ctx.fillStyle = "white";
			ctx.textAlign = "center";
			ctx.textBaseline = "top";
			ctx.font = "32px sans-serif";
			
			ctx.fillText(
				this.time.toFixed(3).toString(),
				sw/2, 16
			);
			
			if (this.player) {
				const PROGRESS_WIDTH = 12;
				if (!this.stopped) {
					ctx.globalAlpha = this.player.x > 16 ? 1 : 0.25;
					
					// split in 2 for proper transparency
					const playerY = flrto(this.player.y / (tmh * TILE_SIZE) * sh, gameScaleInverse);
					ctx.fillStyle = "black"
					ctx.fillRect(0, 0, PROGRESS_WIDTH, playerY);
					ctx.fillRect(0, playerY + PROGRESS_WIDTH, PROGRESS_WIDTH, sh - playerY);
					
					ctx.fillStyle = "#639bff";
					ctx.fillRect(0, playerY, PROGRESS_WIDTH, PROGRESS_WIDTH);
				} else {
					ctx.fillStyle = "black";
					ctx.fillRect(0, 0, PROGRESS_WIDTH, sh);
				}
			}
		};
	}



	let camX = 0;
	let camY = 0;
	let loading = true;
	function draw() {
		if (loading) return drawLoadingScreen();
		ctx.save();
		ctx.scale(gameScale, gameScale);
		ctx.fillStyle = "#115";
		ctx.fillRect(0, 0, sw, sh);
		ctx.save();
		try {
			// effective camera position
			let eCamX = Math.max(flrto(camX, gameScaleInverse), 0);
			let eCamY = Math.max(flrto(camY, gameScaleInverse), 0);
			eCamX = Math.min(eCamX, tmw * TILE_SIZE - sw);
			eCamY = Math.min(eCamY, tmh * TILE_SIZE - sh);
			ctx.translate(-eCamX, -eCamY);
			
			ctx.fillStyle = "#448";
			let minx = flr(eCamX / TILE_SIZE, gameScaleInverse), maxx = minx + ceil(sw / TILE_SIZE) + 1;
			for (let miny = flr(eCamY / TILE_SIZE, gameScaleInverse), y = miny, maxy = miny + ceil(sh / TILE_SIZE) + 1 ; y < maxy; y++) {
				if (!tilemap[y]) continue;
				for (let x = minx; x < maxx; x++) {
					if (tilemap[y][x])
						ctx.drawImage(assets.stone, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
				}
			}
			
			objs.forEach(function(obj) {
				if (obj.draw) {
					ctx.save();
					if ("x" in obj) ctx.translate(flrto(+obj.x, gameScaleInverse), flrto(+obj.y, gameScaleInverse))
					if (obj.isGUI) ctx.translate(eCamX, eCamY);
					obj.draw(ctx);
					ctx.restore();
				}
			});
		} catch(e) {
			throw e;
		} finally {
			ctx.restore();
			if (debugMode) {
				ctx.fillStyle = "white";
				ctx.textAlign = "left";
				ctx.textBaseline = "top";
				ctx.font = "12px sans-serif";
				ctx.fillText(
					"DEBUG",
					2, 2
				);
			}
		}
		if (paused) {
			drawPause();
		}
		ctx.restore();
	}

	let fpsCounter = null;
	if (debugMode && globalThis.document) fpsCounter = document.getElementById("fps");

	let lastT = 0;
	const maxDelta = 1 / 10;
	function step(t) {
		const dt = Math.min((t - lastT) / 1000, maxDelta);
		lastT = t;
		if (fpsCounter) fpsCounter.textContent = flr(1 / dt);
		
		if (paused) {
			stepPause();
		} else {
			objs.forEach(function(obj) {
				if (obj.step) obj.step(dt);
			});
			if (justPressed("enter") || justPressed("esc")) enterPause();
		}
		draw();
		buttonsJust.forEach(function(bt) {
			buttonsJust.delete(bt);
		});
		requestAnimationFrame(step);
		resizedThisFrame = false;
	}

	let paused = false;
	let pauseMenu = null;
	let pauseIndex = 0;
	let onTitle = false;
	function enterPause() {
		paused = true;
		pauseIndex = 0;
		pauseMenu = [
			["Continue", function() {}],
			["New Game", function() {
				startGame();
			}],
			[function() {
				return "Game Length: " + gameLength;
			}, function() {
				let index = gameLengths.indexOf(gameLength) + 1;
				if (index >= gameLengths.length) index = 0;
				gameLength = gameLengths[index];
				return true;
			}],
			["Exit", function() {
				titleScreen();
				return true;
			}],
		];
	}
	function drawPause() {
		let cx = 16;
		let cy = 16;
		ctx.fillStyle = "white";
		ctx.textAlign = "left";
		ctx.textBaseline = "top";
		
		if (onTitle) {
			ctx.font = "bold 48px sans-serif";
			ctx.fillText(
				"CST Stone Simulator",
				cx, cy, sw
			);
			cy += 64;
		}
		
		for (let _i in pauseMenu) {
			const i = +_i;
			const fontSize = 28;
			if (pauseIndex !== i) {
				ctx.font = fontSize + "px sans-serif";
			} else {
				ctx.font = "bold "+fontSize+"px sans-serif";
			}
			let text = pauseMenu[i][0];
			if (typeof text !== "string") text = text();
			ctx.fillText(
				(pauseIndex === i ? "> " : "  ") +
				text,
				cx, cy, sw
			);
			cy += fontSize;
		}
		
		if (onTitle) {
			const description = "Get to the bottom of the Cave of Inexplicably Detailed Uniform Rocks." 
				+ "\nArrow keys to move."
				+ "\nSpace to pick up/place the block below you."
				+ "\nEnter/Esc to pause."
				+ "\nThere is less empty space deep down, so longer games are harder."
				+ "\n\n" + gameLength + " games are around " + gameTimes[gameLength] + " seconds long and are " + lengthHeights[gameLength] + " blocks tall.";
			cx = 16;
			cy = sh/2 + 16;
			
			const fontSize = 20;
			ctx.font = fontSize+"px sans-serif";
			const lines = description.split("\n");
			lines.forEach(function(line) {
				ctx.fillText(
					line,
					cx, cy, sw - 32
				);
				cy += fontSize;
			});
		}
	}
	function stepPause() {
		if (justPressed("enter") || justPressed("spacebar") || (!onTitle && justPressed("esc"))) {
			if (justPressed("esc")) pauseIndex = 0;
			if (!pauseMenu[pauseIndex][1]()) {
				paused = false;
				pauseMenu = null;
			}
		}
		if (justPressed("up"))
			pauseIndex = Math.max(pauseIndex - 1, 0);
		if (justPressed("down"))
			pauseIndex = Math.min(pauseIndex + 1, pauseMenu.length - 1);
	}

	function titleScreen() {
		onTitle = true;
		objs.length = 0;
		tmw = 1;
		tmh = 1;
		genLevel(false);
		
		paused = true;
		pauseIndex = 0;
		pauseMenu = [
			["Start", function() {
				startGame();
			}],
			[function() {
				return "Game Length: " + gameLength;
			}, function() {
				let index = gameLengths.indexOf(gameLength) + 1;
				if (index >= gameLengths.length) index = 0;
				gameLength = gameLengths[index];
				return true;
			}],
			["Made by CST1229", function() {
				setTimeout(function() {
					openLink("https://cst1229.eu.org/");
				}, 100);
				return true;
			}],
			["Source Code", function() {
				setTimeout(function() {
					openLink("https://github.com/CST1229/StoneSimulator/");
				}, 100);
				return true;
			}]
		];
		if (isDesktop) {
			pauseMenu.push(["Quit", function() {
				window.close();
			}]);
		}
	}
	function startGame() {
		onTitle = false;
		objs.length = 0;
		camX = 0;
		camY = 0;
		
		tmw = 50;
		tmh = lengthHeights[gameLength];
		genLevel(true);
		
		const timer = new Timer();
		objs.push(new Player(timer));
		objs.push(timer);
	}


	let loadedAssets = 0;
	let allAssets = 0;
	const loadErrors = [];
	function drawLoadingScreen() {
		ctx.save();
		ctx.scale(gameScale, gameScale);
		ctx.fillStyle = "black";
		ctx.fillRect(0, 0, sw, sh);
		ctx.fillStyle = "white";
		ctx.textAlign = "left";
		ctx.textBaseline = "top";
		ctx.font = "bold 24px sans-serif";
		
		let loadingText = "";
		
		if (loadedAssets !== allAssets) {
			loadingText += "Loading... (" + loadedAssets + "/" + allAssets + ")\n";
		}
		loadErrors.forEach(function(err) {
			loadingText += err + "\n";
		});
		
		let cx = 24;
		let cy = 24;
		const lines = loadingText.split("\n");
		lines.forEach(function(line) {
			ctx.fillText(
				line,
				cx, cy
			);
			cy += 24;
		});
		ctx.restore();
	}

	Object.keys(assets).forEach(function(key) {
		allAssets++;
		const filename = getAssetUrl("./assets/" + key + ".png");
		const img = new Image();
		assets[key] = img;
		img.onload = function() {
			loadedAssets++;
			draw();
			if (loadedAssets === allAssets && !loadErrors.length) {
				titleScreen();
				loading = false;
				requestAnimationFrame(step);
			}
		};
		img.onerror = function(e) {
			loadedAssets++;
			loadErrors.push(
				"Could not load " + filename + "."
			);
			draw();
		};
		img.src = filename;
	});

	if (!debugMode) {
		setEventListener(window, "resize", resizeGame);
	}
	resizeGame();
	draw();
}