class SCController {
    constructor(canvas, sendSocketCmdFn) {
        this.canvas = canvas;
        this.sendSocketCmd = sendSocketCmdFn;
        this.enabled = true;
        this.isMouseDown = false;
        this.startX = 0;
        this.startY = 0;
        this.currentX = 0;
        this.currentY = 0;
        this.lastSentX = -1;
        this.lastSentY = -1;
        this.lastMoveTime = 0;
        this.lastWheelTime = 0;

        this.init();
    }

    init() {
        if (!this.canvas) return;
        this.canvas.tabIndex = 0;

        this.canvas.addEventListener("mousedown", (e) => this.onMouseDown(e));
        this.canvas.addEventListener("mousemove", (e) => this.onMouseMove(e));
        this.canvas.addEventListener("mouseup", (e) => this.onMouseUp(e));
        this.canvas.addEventListener("mouseleave", (e) => this.onMouseLeave(e));
        this.canvas.addEventListener("contextmenu", (e) => this.onContextMenu(e));
        this.canvas.addEventListener("auxclick", (e) => this.onAuxClick(e));
        this.canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
        this.canvas.addEventListener("keydown", (e) => this.onKeyDown(e));
    }

    setEnabled(state) {
        this.enabled = !!state;
        if (this.canvas) {
            this.canvas.style.cursor = this.enabled ? "pointer" : "default";
        }
    }

    sendCmd(commandStr) {
        if (typeof this.sendSocketCmd === "function") {
            this.sendSocketCmd(commandStr);
        }
    }

    getCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;
        const scaleX = (this.canvas.width || 1) / (rect.width || 1);
        const scaleY = (this.canvas.height || 1) / (rect.height || 1);

        return {
            x: Math.round(clientX * scaleX),
            y: Math.round(clientY * scaleY)
        };
    }

    onMouseDown(e) {
        if (!this.enabled || e.button !== 0) return;
        this.canvas.focus();
        const coords = this.getCoordinates(e);
        this.startX = coords.x;
        this.startY = coords.y;
        this.currentX = coords.x;
        this.currentY = coords.y;
        this.lastSentX = coords.x;
        this.lastSentY = coords.y;
        this.isMouseDown = true;

        this.sendCmd(`DOWN ${coords.x} ${coords.y}`);
    }

    onMouseMove(e) {
        if (!this.enabled || !this.isMouseDown) return;
        const coords = this.getCoordinates(e);
        this.currentX = coords.x;
        this.currentY = coords.y;

        // Eliminate command queue backlog: Only send MOVE if moved >= 4px from last sent point
        const dist = Math.hypot(coords.x - this.lastSentX, coords.y - this.lastSentY);
        if (dist >= 4) {
            const now = Date.now();
            if (now - this.lastMoveTime >= 25) { // 40 FPS queue-free rate
                this.lastMoveTime = now;
                this.lastSentX = coords.x;
                this.lastSentY = coords.y;
                this.sendCmd(`MOVE ${coords.x} ${coords.y}`);
            }
        }
    }

    onMouseUp(e) {
        if (!this.enabled || !this.isMouseDown || e.button !== 0) return;
        this.isMouseDown = false;
        const coords = this.getCoordinates(e);
        const dist = Math.hypot(coords.x - this.startX, coords.y - this.startY);

        if (dist < 8) {
            this.sendCmd(`TAP ${coords.x} ${coords.y}`);
        } else {
            this.sendCmd(`UP ${coords.x} ${coords.y}`);
        }
    }

    onMouseLeave() {
        if (this.isMouseDown) {
            this.isMouseDown = false;
            this.sendCmd(`UP ${this.currentX} ${this.currentY}`);
        }
    }

    onContextMenu(e) {
        if (!this.enabled) return;
        e.preventDefault();
        this.sendCmd("KEY 4"); // KEYCODE_BACK
    }

    onAuxClick(e) {
        if (!this.enabled) return;
        if (e.button === 1) { // Middle click
            e.preventDefault();
            this.sendCmd("KEY 3"); // KEYCODE_HOME
        }
    }

    onWheel(e) {
        if (!this.enabled) return;
        e.preventDefault();

        const now = Date.now();
        if (now - this.lastWheelTime < 60) return;
        this.lastWheelTime = now;

        const coords = this.getCoordinates(e);
        const amount = e.deltaY > 0 ? -2 : 2;

        this.sendCmd(`SCROLL ${coords.x} ${coords.y} ${amount}`);
    }

    onKeyDown(e) {
        if (!this.enabled) return;

        const keyMap = {
            "Backspace": 67, // KEYCODE_DEL
            "Delete": 112,  // KEYCODE_FORWARD_DEL
            "Enter": 66,   // KEYCODE_ENTER
            "Escape": 4,    // KEYCODE_BACK
            "Tab": 61,     // KEYCODE_TAB
            "ArrowUp": 19,  // KEYCODE_DPAD_UP
            "ArrowDown": 20,// KEYCODE_DPAD_DOWN
            "ArrowLeft": 21,// KEYCODE_DPAD_LEFT
            "ArrowRight": 22,// KEYCODE_DPAD_RIGHT
            "Home": 3,      // KEYCODE_HOME
            "F2": 187       // KEYCODE_APP_SWITCH
        };

        if (keyMap[e.key]) {
            e.preventDefault();
            this.sendCmd(`KEY ${keyMap[e.key]}`);
            return;
        }

        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.text(e.key);
        }
    }

    text(str) {
        let escaped = "";
        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if (char === " ") {
                escaped += "%s";
            } else if ("\"'\\&<>|;$()~*#[]{}".includes(char)) {
                escaped += "\\" + char;
            } else {
                escaped += char;
            }
        }
        if (escaped) {
            this.sendCmd(`TEXT ${escaped}`);
        }
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = SCController;
}
