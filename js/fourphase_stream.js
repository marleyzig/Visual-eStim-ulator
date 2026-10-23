// js/fourphase_stream.js

// ==========================================
// 0. GLOBAL RECORDING STATE
// ==========================================
//let isRecordingSession = false;
//let sessionStartTime = 0;
//let sessionData = [];

// ==========================================
// 1. PURE MATH ENGINE (Global Constants)
// ==========================================
const BARY_COLORS = ['rgba(254, 46, 46, 0.6)', 'rgba(84, 99, 255, 0.6)', 'rgba(255, 199, 23, 0.6)', 'rgba(31, 158, 64, 0.6)'];
const TRI_SCALE = 1.3;
const SQRT3 = Math.sqrt(3);

const TRI_UP = [0, -1 * TRI_SCALE];
const TRI_LEFT = [(SQRT3 / 2) * TRI_SCALE, 0.5 * TRI_SCALE];
const TRI_RIGHT = [-(SQRT3 / 2) * TRI_SCALE, 0.5 * TRI_SCALE];

const GRID_ORIGIN = [0.5, 1.5];
const GRID_BASIS = [
    [1 * TRI_SCALE, 0.5 * TRI_SCALE],
    [0, (-SQRT3 / 2) * TRI_SCALE]
];

const det = GRID_BASIS[0][0] * GRID_BASIS[1][1] - GRID_BASIS[0][1] * GRID_BASIS[1][0];
const GRID_BASIS_INV = [
    [GRID_BASIS[1][1] / det, -GRID_BASIS[0][1] / det],
    [-GRID_BASIS[1][0] / det, GRID_BASIS[0][0] / det]
];

const TRIANGLES = [];
for(let v = -4; v <= 4; v++) {
    for(let u = -4; u <= 4; u++) {
        TRIANGLES.push({u, v, up: true});
        TRIANGLES.push({u, v, up: false});
    }
}

function triangleCenter(u, v, isPointingUp) {
    let ux = isPointingUp ? (u + 1/3) : (u + 2/3);
    let vy = isPointingUp ? (v + 1/3) : (v + 2/3);
    return [ GRID_ORIGIN[0] + GRID_BASIS[0][0] * ux + GRID_BASIS[0][1] * vy, GRID_ORIGIN[1] + GRID_BASIS[1][0] * ux + GRID_BASIS[1][1] * vy ];
}

function triangleBasis(u, v, isPointingUp) {
    let isOddRow = (Math.abs(v) % 2) === 1;
    let b0, b1, b2;
    if (isOddRow) { b0 = [TRI_LEFT[0]/SQRT3, TRI_LEFT[1]/SQRT3]; b1 = [TRI_UP[0]/SQRT3, TRI_UP[1]/SQRT3]; b2 = [TRI_RIGHT[0]/SQRT3, TRI_RIGHT[1]/SQRT3]; } 
    else { b0 = [TRI_RIGHT[0]/SQRT3, TRI_RIGHT[1]/SQRT3]; b1 = [TRI_UP[0]/SQRT3, TRI_UP[1]/SQRT3]; b2 = [TRI_LEFT[0]/SQRT3, TRI_LEFT[1]/SQRT3]; }
    if (!isPointingUp) { b0 = [b0[0], -b0[1]]; b1 = [b1[0], -b1[1]]; b2 = [b2[0], -b2[1]]; }
    return [b0, b1, b2];
}

function safeMod(n, m) { return ((n % m) + m) % m; }

function triangleColorIndex(u, v, isPointingUp) {
    let isOddRow = (Math.abs(v) % 2) === 1;
    let upVal = isPointingUp ? 1 : 0;
    let val = isOddRow ? (u * 2 + 2 + upVal) : (u * 2 + 1 - upVal);
    return safeMod(val, 4);
}

function screenPosToIndex(x, y) {
    let dx = x - GRID_ORIGIN[0], dy = y - GRID_ORIGIN[1];
    let u = GRID_BASIS_INV[0][0] * dx + GRID_BASIS_INV[0][1] * dy;
    let v = GRID_BASIS_INV[1][0] * dx + GRID_BASIS_INV[1][1] * dy;
    let isPointingUp = (safeMod(u, 1) + safeMod(v, 1)) <= 1;
    return { u: Math.floor(u), v: Math.floor(v), isPointingUp: isPointingUp };
}

function getBarycentricCoords(px, py, ax, ay, bx, by, cx, cy) {
    let denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (denom === 0) return [0.33, 0.33, 0.33];
    let alpha = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / denom;
    let beta = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / denom;
    return [alpha, beta, 1 - alpha - beta];
}

function barycentricToIntensity(b0, b1, b2) {
    let maxBary = Math.max(b0, b1, b2, 0.001);
    let i0 = 1 - (b0 / maxBary), i1 = 1 - (b1 / maxBary), i2 = 1 - (b2 / maxBary);
    let sum = i0 + i1 + i2;
    if (sum < 1) { let diff = (1 - sum) / 3; i0 += diff; i1 += diff; i2 += diff; }
    return [Math.max(0, Math.min(1, i0)), Math.max(0, Math.min(1, i1)), Math.max(0, Math.min(1, i2))];
}

function getSinePulse(phase, orbitRadius) {
    return 0.5 + (((Math.sin(phase) + 1.0) / 2.0) - 0.5) * orbitRadius;         
}

// ==========================================
// 2. OO INSTANCE CLASS
// ==========================================
class SpatialSequencer {
    
    constructor(containerId, defaultWs) {
        this.id = containerId;
        this.container = document.getElementById(containerId);
        
        // Isolate Radio Button Groups by appending the Deck ID
        this.container.querySelectorAll('input[type="radio"]').forEach(radio => {
            radio.name = radio.name + '_' + this.id;
        });

        // State variables
        this.ws = null;
        this.lastUpdate = 0;
        this.STREAM_INTERVAL_MS = 33; 
        this.cX = 0.5; 
        this.cY = 0.5; 
        this.driftingToCenter = false;
        this.isDragging = false;
        this.currentPhase = 0;
        this.hPhase = 0; 
        this.vPhase = 0;

        // NEW: Pendulum State Machine Integrator
        this.pendAngle = 0;
        this.pendState = 'CW'; // 'CW', 'PAUSE_OUT', 'CCW', 'PAUSE_IN'
        this.pendTimer = 0;
		
        this.lastFrameTime = performance.now() / 1000.0;
        this.isPlaying = false; 
        this.activeViewMode = 'diamond';

        // DOM Element Queries
        this.canvas = this.container.querySelector('.diamondCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.waterCanvas = this.container.querySelector('.waterLevelsCanvas');
        this.wCtx = this.waterCanvas.getContext('2d');

        this.btnConnect = this.container.querySelector('.btnConnect');
        this.wsAddress = this.container.querySelector('.wsAddress');
        this.wsPresetSelect = this.container.querySelector('.wsPresetSelect');
        this.statusText = this.container.querySelector('.streamStatus');
        
        // NEW: Grab the Accordion and Summary span for the connection panel
        this.wsContainer = this.container.querySelector('.wsContainer');
        this.wsSummaryStatus = this.container.querySelector('.wsSummaryStatus');
        
        this.btnReset = this.container.querySelector('.btnCenterReset');
        this.btnPlayPause = this.container.querySelector('.btnPlayPause');

        this.seqPatternSelect = this.container.querySelector('.seqPattern');
        this.seqSpeed = this.container.querySelector('.seqSpeed');
        this.seqRadius = this.container.querySelector('.seqRadius');
		this.syncRadiusToggle = this.container.querySelector('.syncRadiusToggle');
        this.mainRadiusContainer = this.container.querySelector('.mainRadiusContainer');
        this.splitRadiusContainer = this.container.querySelector('.splitRadiusContainer');
        this.seqRadiusX = this.container.querySelector('.seqRadiusX');
        this.seqRadiusY = this.container.querySelector('.seqRadiusY');
        this.seqAngle = this.container.querySelector('.seqAngle');
        this.masterVol = this.container.querySelector('.masterVol');
        
        this.optDiagSeq = this.container.querySelector('.optDiagSeq');
        this.optDiagMac = this.container.querySelector('.optDiagMac');
        this.optTess = this.container.querySelector('.optTess');

        this.advHWidth = this.container.querySelector('.advHWidth');
        this.advHSpeed = this.container.querySelector('.advHSpeed');
        this.advVWidth = this.container.querySelector('.advVWidth');
        this.advVSpeed = this.container.querySelector('.advVSpeed');
        
        this.btnSyncLFO = this.container.querySelector('.btnSyncLFO');
        this.btnResetLFO = this.container.querySelector('.btnResetLFO');

        this.viewModeSelect = this.container.querySelector('.viewMode');
        this.waterLevelsContainer = this.container.querySelector('.waterLevelsContainer');
        
        // NEW Tab Management Elements
        this.tabButtons = this.container.querySelectorAll('.btnTab');
        this.displayPanes = this.container.querySelectorAll('.pane');
        this.tabEngine = this.container.querySelector('.tabEngine');
        this.tabSnap = this.container.querySelector('.tabSnap');
        this.emptyState = this.container.querySelector('.emptyState');
		
		this.seqSweepArc = this.container.querySelector('.seqSweepArc');
        this.seqPauseMs = this.container.querySelector('.seqPauseMs');

        // Apply Defaults
        this.wsAddress.value = defaultWs;

        // Method Binding
        this.mainLoop = this.mainLoop.bind(this);
        this.updateCenterFromEvent = this.updateCenterFromEvent.bind(this);
        this.applyViewMode = this.applyViewMode.bind(this);
        this.snapToGridCoordinate = this.snapToGridCoordinate.bind(this);

        this.initEvents();
        this.applyViewMode(this.viewModeSelect.value);
        requestAnimationFrame(this.mainLoop);
    }

    applyViewMode(mode) {
        this.activeViewMode = mode;
        this.waterLevelsContainer.style.display = (mode === 'barycentric') ? 'flex' : 'none';
        
        this.btnReset.style.display = (mode === 'barycentric') ? 'none' : 'block';
        this.optDiagSeq.style.display = (mode === 'barycentric') ? 'none' : 'block';
        this.optDiagMac.style.display = (mode === 'barycentric') ? 'none' : 'block';
        this.optTess.style.display = (mode === 'barycentric') ? 'block' : 'none';
        
        //if (this.snapPanel) this.snapPanel.style.display = (mode === 'barycentric') ? 'block' : 'none';
        //if (this.engineModeContainer) this.engineModeContainer.style.display = (mode === 'barycentric') ? 'none' : 'block';
		
		// Tab Button Visibility Toggles
        if (this.tabEngine) this.tabEngine.style.display = (mode === 'barycentric') ? 'none' : 'block';
        if (this.tabSnap) this.tabSnap.style.display = (mode === 'barycentric') ? 'block' : 'none';

        // Force close a tab if we just hid it while it was active
        if (mode === 'barycentric' && this.tabEngine && this.tabEngine.classList.contains('activeTab')) {
            this.tabEngine.click();
        } else if (mode === 'diamond' && this.tabSnap && this.tabSnap.classList.contains('activeTab')) {
            this.tabSnap.click();
        }

        const isTessPattern = this.seqPatternSelect.value.startsWith('tess_');
        if (mode === 'barycentric' && !isTessPattern) {
            this.seqPatternSelect.value = 'tess_diag_tl_br';
            this.seqPatternSelect.dispatchEvent(new Event('change'));
        } else if (mode === 'diamond' && isTessPattern) {
            this.seqPatternSelect.value = 'round_robin';
            this.seqPatternSelect.dispatchEvent(new Event('change'));
        }
    }

    snapToGridCoordinate(ux, vy) {
        let gridX = GRID_ORIGIN[0] + GRID_BASIS[0][0] * ux + GRID_BASIS[0][1] * vy;
        let gridY = GRID_ORIGIN[1] + GRID_BASIS[1][0] * ux + GRID_BASIS[1][1] * vy;
        this.cX = gridX / 4;
        this.cY = 1 - (gridY / 4);
        this.driftingToCenter = false;
    }

    updateCenterFromEvent(e) {
        this.driftingToCenter = false;
        
        const freeSnap = this.container.querySelector(`input[name="tessSnap_${this.id}"][value="free"]`);
        if (freeSnap) freeSnap.checked = true;
        
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const canvasX = (e.touches ? e.touches[0].clientX : e.clientX - rect.left) * scaleX;
        const canvasY = (e.touches ? e.touches[0].clientY : e.clientY - rect.top) * scaleY;
        
        const L = 350; 
        const offX = (this.canvas.width - L) / 2;
        const offY = (this.canvas.height - L) / 2;
        
        const rawX = (canvasX - offX) / L;
        const rawY = (canvasY - offY) / L;

        this.cX = Math.max(-0.25, Math.min(1.25, rawX));
        this.cY = Math.max(-0.25, Math.min(1.25, rawY));
    }

    initEvents() {
        this.viewModeSelect.addEventListener('change', (e) => this.applyViewMode(e.target.value));
		
		this.syncRadiusToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.mainRadiusContainer.style.display = 'block';
                this.splitRadiusContainer.style.display = 'none';
            } else {
                this.mainRadiusContainer.style.display = 'none';
                this.splitRadiusContainer.style.display = 'grid';
                // Inherit the master value immediately when splitting
                this.seqRadiusX.value = this.seqRadius.value;
                this.seqRadiusY.value = this.seqRadius.value;
                this.seqRadiusX.dispatchEvent(new Event('input'));
                this.seqRadiusY.dispatchEvent(new Event('input'));
            }
        });
		
		// --- NEW: Tab Menu Logic ---
        this.tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetPaneClass = btn.getAttribute('data-target');
                
                // If clicking the already active tab, toggle it off to hide everything
                if (btn.classList.contains('activeTab')) {
                    btn.classList.remove('activeTab');
                    btn.style.background = '#333';
                    btn.style.borderColor = '#555';
                    this.displayPanes.forEach(p => p.style.display = 'none');
                    this.emptyState.style.display = 'block';
                    return;
                }
                
                // Reset all tabs to default state
                this.tabButtons.forEach(t => { 
                    t.classList.remove('activeTab'); 
                    t.style.background = '#333';
                    t.style.borderColor = '#555';
                });
                
                // Hide all panes
                this.displayPanes.forEach(p => p.style.display = 'none');
                
                // Highlight the clicked tab
                btn.classList.add('activeTab');
                btn.style.background = '#1a1a1a'; // Match the background of the display area
                btn.style.borderColor = 'var(--purple)';
                
                // Show the specific target pane
                const targetPane = this.container.querySelector('.' + targetPaneClass);
                if (targetPane) targetPane.style.display = 'block';
            });
        });

        this.btnPlayPause.addEventListener('click', () => {
            this.isPlaying = !this.isPlaying;
            if (this.isPlaying) {
                this.btnPlayPause.innerText = '⏹ Stop Deck';
                this.btnPlayPause.style.background = '#f55';
                this.btnPlayPause.style.color = '#fff';
            } else {
                this.btnPlayPause.innerText = '▶ Start Deck';
                this.btnPlayPause.style.background = '#0f9';
                this.btnPlayPause.style.color = '#000';
            }
        });

        if (this.btnSyncLFO) this.btnSyncLFO.addEventListener('click', () => { this.hPhase = 0; this.vPhase = 0; });
        if (this.btnResetLFO) {
            this.btnResetLFO.addEventListener('click', () => {
                const hWidth = parseFloat(this.advHWidth.value) / 100.0;
                const vWidth = parseFloat(this.advVWidth.value) / 100.0;
                this.cX = Math.max(-0.25, Math.min(1.25, this.cX + Math.cos(this.hPhase) * (hWidth * 0.5)));
                this.cY = Math.max(-0.25, Math.min(1.25, this.cY + Math.sin(this.vPhase) * (vWidth * 0.5)));

                this.advHWidth.value = 0;
                this.advVWidth.value = 0;
                this.advHWidth.dispatchEvent(new Event('input'));
                this.advVWidth.dispatchEvent(new Event('input'));
                this.driftingToCenter = true;
            });
        }

        this.seqPatternSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (this.seqAngle) {
                this.seqAngle.value = 0;
                this.seqAngle.dispatchEvent(new Event('input'));
            }
			
			if (val === 'radius_pulse') {
                this.seqRadius.value = 20;
                this.seqRadius.dispatchEvent(new Event('input'));
            }
            
            if (val.startsWith('macro_')) {
                if (val === 'macro_toggle_bc') { this.cX = 0.25; this.cY = 0.25; } 
                if (val === 'macro_toggle_ad') { this.cX = 0.75; this.cY = 0.75; } 
                if (val === 'macro_toggle_cd') { this.cX = 0.75; this.cY = 0.25; } 
                if (val === 'macro_toggle_ab') { this.cX = 0.25; this.cY = 0.75; } 
                
                this.driftingToCenter = false;
                this.seqRadius.value = 25;
                this.seqRadius.dispatchEvent(new Event('input'));
                this.container.querySelector(`input[name="seqEngine_${this.id}"][value="geometric"]`).checked = true;
            }
            
            if (val.startsWith('tess_')) {
                let targetRadius = 16.25; 
                let targetSpeed = 0.50;
				
				// Add this new line:
                if (val === 'tess_radius_pulse') targetRadius = 20;

                if (val.startsWith('tess_macro_')) {
                    if (val === 'tess_macro_bc') { this.cX = 0.20625; this.cY = 0.765625; }
                    else if (val === 'tess_macro_ad' || val === 'tess_macro_ac_bd_flipflop') { this.cX = 0.53125; this.cY = 0.765625; }
                    else if (val === 'tess_macro_a_center') { this.cX = 0.6125; this.cY = 0.53125; targetRadius = 100; }
                }
                
                this.driftingToCenter = false;
                this.seqSpeed.value = targetSpeed;
                this.seqRadius.value = targetRadius;
                
                const intensityRadio = this.container.querySelector(`input[name="seqEngine_${this.id}"][value="intensity"]`);
                if (intensityRadio) intensityRadio.checked = true;
                
                this.seqSpeed.dispatchEvent(new Event('input'));
                this.seqRadius.dispatchEvent(new Event('input'));
            }
        });

        this.container.querySelectorAll(`input[name="tessSnap_${this.id}"]`).forEach(radio => {
            radio.addEventListener('change', (e) => {
                const v = e.target.value;
                if (v === 'free') return;
                
                if (v === 'center_a') this.snapToGridCoordinate(5/3, -1/3);
                else if (v === 'center_b') this.snapToGridCoordinate(2/3, 2/3);
                else if (v === 'center_c') this.snapToGridCoordinate(4/3, 1/3);
                else if (v === 'center_d') this.snapToGridCoordinate(5/3, 2/3);

                else if (v === 'edge_ab') this.snapToGridCoordinate(1.5, -0.5);
                else if (v === 'edge_ac') this.snapToGridCoordinate(1.5, 0.0);
                else if (v === 'edge_ad') this.snapToGridCoordinate(2.0, -0.5);
                else if (v === 'edge_bc') this.snapToGridCoordinate(1.0, 0.5);
                else if (v === 'edge_bd') this.snapToGridCoordinate(0.5, 1.0);
                else if (v === 'edge_cd') this.snapToGridCoordinate(1.5, 0.5);

                else if (v === 'vert_aa') this.snapToGridCoordinate(2.0, -1.0);
                else if (v === 'vert_bb') this.snapToGridCoordinate(1.0, 0.0);
                else if (v === 'vert_cc') this.snapToGridCoordinate(1.0, -1.0);
                else if (v === 'vert_dd') this.snapToGridCoordinate(2.0, 0.0);
            });
        });

        const bindText = (cls) => {
            const el = this.container.querySelector('.' + cls);
            const txt = this.container.querySelector('.' + cls + 'Val');
            if (el && txt) el.addEventListener('input', e => txt.innerText = e.target.value);
        };
        //['seqSpeed', 'seqRadius', 'seqAngle', 'masterFreq', 'masterVol', 'advHWidth', 'advHSpeed', 'advVWidth', 'advVSpeed'].forEach(bindText);
		//['seqSpeed', 'seqRadius', 'seqAngle', 'masterVol', 'advHWidth', 'advHSpeed', 'advVWidth', 'advVSpeed', 'seqSweepArc', 'seqPauseMs'].forEach(bindText);
		//['seqSpeed', 'seqRadius', 'seqAngle', 'masterVol', 'advHWidth', 'advHSpeed', 'advVWidth', 'advVSpeed', 'seqSweepArc', 'seqPauseMs', 'rsC0', 'rsP0', 'rsP1', 'rsP2', 'rsP3'].forEach(bindText);
		['seqSpeed', 'seqRadius', 'seqRadiusX', 'seqRadiusY', 'seqAngle', 'masterVol', 'advHWidth', 'advHSpeed', 'advVWidth', 'advVSpeed', 'seqSweepArc', 'seqPauseMs', 'rsC0', 'rsP0', 'rsP1', 'rsP2', 'rsP3'].forEach(bindText);
		
		/*
        this.container.querySelectorAll('input[type="range"]').forEach(slider => {
            slider.addEventListener('wheel', (e) => {
                e.preventDefault(); 
                const step = parseFloat(slider.step) || 1;
                const min = parseFloat(slider.min) || 0;
                const max = parseFloat(slider.max) || 100;
                let val = Math.max(min, Math.min(max, parseFloat(slider.value) + (e.deltaY < 0 ? step : -step)));
                slider.value = val.toFixed((slider.step && slider.step.includes('.')) ? slider.step.split('.')[1].length : 0);
                slider.dispatchEvent(new Event('input'));
            }, { passive: false }); 
        });
		*/

        if (this.wsPresetSelect && this.wsAddress) {
            this.wsPresetSelect.addEventListener('change', (e) => this.wsAddress.value = e.target.value);
        }
        
		this.btnConnect.addEventListener('click', () => {
            if (this.ws) this.ws.close();
            this.ws = new WebSocket(this.wsAddress.value);
            
            this.ws.onopen = () => { 
                this.statusText.textContent = 'Connected'; 
                this.statusText.style.color = '#0f9'; 
                
                // Update outer accordion text to bold green
                if (this.wsSummaryStatus) {
                    this.wsSummaryStatus.textContent = 'Connected';
                    this.wsSummaryStatus.style.color = '#0f9';
                    this.wsSummaryStatus.style.fontWeight = 'bold';
                }
                
                // Paint the border green and auto-close the accordion to save space!
                if (this.wsContainer) {
                    this.wsContainer.style.borderColor = '#0f9';
                    this.wsContainer.open = false; 
                }
            };
            
            this.ws.onclose = () => { 
                this.statusText.textContent = 'Disconnected'; 
                this.statusText.style.color = '#f55'; 
                
                // Revert outer accordion text to grey
                if (this.wsSummaryStatus) {
                    this.wsSummaryStatus.textContent = 'Disconnected';
                    this.wsSummaryStatus.style.color = '#777';
                    this.wsSummaryStatus.style.fontWeight = 'normal';
                }
                
                // Revert border to default
                if (this.wsContainer) {
                    this.wsContainer.style.borderColor = '#333';
                }
            };
        });

        this.canvas.addEventListener('mousedown', (e) => { this.isDragging = true; this.updateCenterFromEvent(e); });
        this.canvas.addEventListener('mousemove', (e) => { if(this.isDragging) this.updateCenterFromEvent(e); });
        window.addEventListener('mouseup', () => this.isDragging = false);
        this.canvas.addEventListener('touchstart', (e) => { this.isDragging = true; this.updateCenterFromEvent(e); }, {passive: false});
        this.canvas.addEventListener('touchmove', (e) => { if(this.isDragging) { this.updateCenterFromEvent(e); e.preventDefault(); } }, {passive: false});
        window.addEventListener('touchend', () => this.isDragging = false);
        this.btnReset.addEventListener('click', () => this.driftingToCenter = true);
    }

    mainLoop() {
		// ZOMBIE KILLER: If this deck's HTML was closed/removed, kill this loop permanently!
        if (!document.getElementById(this.id)) return;
		
        requestAnimationFrame(this.mainLoop);
        const now = performance.now() / 1000.0;
        const dt = now - this.lastFrameTime;
        this.lastFrameTime = now;

        if (this.driftingToCenter) {
            const dx = 0.5 - this.cX, dy = 0.5 - this.cY;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 0.005) { this.cX = 0.5; this.cY = 0.5; this.driftingToCenter = false; }
            else { this.cX += (dx/dist) * 0.005; this.cY += (dy/dist) * 0.005; }
        }
        
        const speed = parseFloat(this.seqSpeed.value);
        //const orbitRadius = parseFloat(this.seqRadius.value) / 100.0;
		const isRadiusSync = this.syncRadiusToggle ? this.syncRadiusToggle.checked : true;
        const orbitRadiusX = isRadiusSync ? (parseFloat(this.seqRadius.value) / 100.0) : (parseFloat(this.seqRadiusX.value) / 100.0);
        const orbitRadiusY = isRadiusSync ? (parseFloat(this.seqRadius.value) / 100.0) : (parseFloat(this.seqRadiusY.value) / 100.0);
        const pattern = this.seqPatternSelect.value;
        const engineElement = this.container.querySelector(`input[name="seqEngine_${this.id}"]:checked`);
        const engine = engineElement ? engineElement.value : 'geometric';
        
        const hWidth = parseFloat(this.advHWidth.value) / 100.0;
        const hSpeed = parseFloat(this.advHSpeed.value);
        const vWidth = parseFloat(this.advVWidth.value) / 100.0;
        const vSpeed = parseFloat(this.advVSpeed.value);

        if (this.isPlaying) {
            this.currentPhase = (this.currentPhase + 2 * Math.PI * speed * dt) % (2 * Math.PI);
            this.hPhase = (this.hPhase + 2 * Math.PI * hSpeed * dt) % (2 * Math.PI);
            this.vPhase = (this.vPhase + 2 * Math.PI * vSpeed * dt) % (2 * Math.PI);

            // --- NEW: Continuous Pendulum Integrator ---
            if (pattern === 'pendulum' || pattern === 'tess_pendulum') {
                let sweepArc = parseFloat(this.seqSweepArc.value);
                let pauseMs = parseFloat(this.seqPauseMs.value);
                let speedDegPerSec = sweepArc * speed; // Calculates degrees to move per second

                // Handle dynamic arc shrinking mid-sweep
                if (this.pendAngle > sweepArc) {
                    this.pendAngle = sweepArc;
                    if (this.pendState === 'CW') this.pendState = 'PAUSE_OUT';
                }

                if (this.pendState === 'CW') {
                    this.pendAngle += speedDegPerSec * dt;
                    if (this.pendAngle >= sweepArc) {
                        this.pendAngle = sweepArc;
                        this.pendState = 'PAUSE_OUT';
                        this.pendTimer = 0;
                    }
                } else if (this.pendState === 'PAUSE_OUT') {
                    this.pendTimer += dt * 1000;
                    if (this.pendTimer >= pauseMs) this.pendState = 'CCW';
                } else if (this.pendState === 'CCW') {
                    this.pendAngle -= speedDegPerSec * dt;
                    if (this.pendAngle <= 0) {
                        this.pendAngle = 0;
                        this.pendState = 'PAUSE_IN';
                        this.pendTimer = 0;
                    }
                } else if (this.pendState === 'PAUSE_IN') {
                    this.pendTimer += dt * 1000;
                    if (this.pendTimer >= pauseMs) this.pendState = 'CW';
                }
            }
        }

        const theta = this.currentPhase;
        const effX = Math.max(-0.25, Math.min(1.25, this.cX + Math.cos(this.hPhase) * (hWidth * 0.5)));
        const effY = Math.max(-0.25, Math.min(1.25, this.cY + Math.sin(this.vPhase) * (vWidth * 0.5)));
        
        let s1 = 1, s2 = 1, s3 = 1, s4 = 1;
        switch (pattern) {
            case 'tess_cw_orbit':
            case 'round_robin':
                s1 = getSinePulse(theta, orbitRadiusY);
                s2 = getSinePulse(theta - Math.PI/2, orbitRadiusX);
                s3 = getSinePulse(theta - Math.PI, orbitRadiusY);
                s4 = getSinePulse(theta - 3*Math.PI/2, orbitRadiusX);
                break;
            case 'tess_ccw_orbit':
            case 'reverse_robin':
                s4 = getSinePulse(theta, orbitRadiusX);
                s3 = getSinePulse(theta - Math.PI/2, orbitRadiusY);
                s2 = getSinePulse(theta - Math.PI, orbitRadiusX);
                s1 = getSinePulse(theta - 3*Math.PI/2, orbitRadiusY);
                break;
            case 'tess_vertical':
            case 'vertical':
                s1 = getSinePulse(theta, orbitRadiusY);
                s3 = getSinePulse(theta - Math.PI, orbitRadiusY);
                s2 = s4 = 0.5; 
                break;
            case 'tess_horizontal':
            case 'horizontal':
                s4 = getSinePulse(theta, orbitRadiusX);
                s2 = getSinePulse(theta - Math.PI, orbitRadiusX);
                s1 = s3 = 0.5; 
                break;
            case 'macro_toggle_cd': case 'macro_toggle_ab': case 'diag_ad_bc':
                s1 = getSinePulse(theta, orbitRadiusY);
                s4 = getSinePulse(theta, orbitRadiusX);
                s2 = getSinePulse(theta - Math.PI, orbitRadiusX);
                s3 = getSinePulse(theta - Math.PI, orbitRadiusY);
                break;
            case 'macro_toggle_bc': case 'macro_toggle_ad': case 'diag_cd_ab':
                s3 = getSinePulse(theta, orbitRadiusY);
                s4 = getSinePulse(theta, orbitRadiusX);
                s1 = getSinePulse(theta - Math.PI, orbitRadiusY);
                s2 = getSinePulse(theta - Math.PI, orbitRadiusX);
                break;
            case 'tess_macro_ad':
            case 'tess_macro_bc':
            case 'tess_diag_tl_br': {
                let rX = getSinePulse(theta, orbitRadiusX) - 0.5;
                let rY = getSinePulse(theta, orbitRadiusY) - 0.5;
                let dx = 0.5; let dy = Math.sqrt(3) / 2;     
                s2 = 0.5 + (rX * dx); s4 = 0.5 - (rX * dx);
                s3 = 0.5 + (rY * dy); s1 = 0.5 - (rY * dy);
                break;
            }
            case 'tess_macro_ac_bd_flipflop':
            case 'tess_diag_bl_tr': {
                let rX = getSinePulse(theta, orbitRadiusX) - 0.5;
                let rY = getSinePulse(theta, orbitRadiusY) - 0.5;
                let dx = 0.5; let dy = -Math.sqrt(3) / 2;    
                s2 = 0.5 + (rX * dx); s4 = 0.5 - (rX * dx);
                s3 = 0.5 + (rY * dy); s1 = 0.5 - (rY * dy);
                break;
            }
			case 'tess_pendulum':
            case 'pendulum': {
                let rad = this.pendAngle * (Math.PI / 180.0);
                s1 = 0.5 + (orbitRadiusY * 0.5 * Math.cos(rad)); 
                s3 = 0.5 - (orbitRadiusY * 0.5 * Math.cos(rad)); 
                s2 = 0.5 + (orbitRadiusX * 0.5 * Math.sin(rad)); 
                s4 = 0.5 - (orbitRadiusX * 0.5 * Math.sin(rad)); 
                break;
            }
            case 'radius_pulse':
            case 'tess_radius_pulse': {
                let rY = ((1 - Math.cos(theta)) / 2) * orbitRadiusY; 
                s1 = 0.5 + (rY * 0.5); 
                s3 = 0.5 - (rY * 0.5); 
                s2 = 0.5;             
                s4 = 0.5;             
                break;
            }
            case 'tess_macro_a_center':
            case 'static': default:
                s1 = s2 = s3 = s4 = 0.5;
                break;
        }
        
        const angleDeg = parseFloat(this.seqAngle.value);
        if (angleDeg !== 0) {
            const rad = angleDeg * (Math.PI / 180.0);
            const cosA = Math.cos(rad); const sinA = Math.sin(rad);
            const vx = s2 - s4; const vy = s3 - s1; 
            const rx = vx * cosA - vy * sinA; const ry = vx * sinA + vy * cosA;
            s1 = 0.5 - ry / 2.0; s3 = 0.5 + ry / 2.0; s4 = 0.5 - rx / 2.0; s2 = 0.5 + rx / 2.0;
        }

        let e1, e2, e3, e4, actualX, actualY;

        if (this.activeViewMode === 'barycentric') {
            const virtualX = (s2 - s4); 
            const virtualY = (s3 - s1); 
            actualX = Math.max(-0.25, Math.min(1.25, effX + virtualX));
            actualY = Math.max(-0.25, Math.min(1.25, effY + virtualY));

            let gridX = actualX * 4;
            let gridY = (1 - actualY) * 4;

            let index = screenPosToIndex(gridX, gridY);
            let center = triangleCenter(index.u, index.v, index.isPointingUp);
            let basis = triangleBasis(index.u, index.v, index.isPointingUp);
            let colorIdx = triangleColorIndex(index.u, index.v, index.isPointingUp);

            let baryCoords = getBarycentricCoords(gridX - center[0], gridY - center[1], basis[0][0], basis[0][1], basis[1][0], basis[1][1], basis[2][0], basis[2][1]);
            let intens = barycentricToIntensity(baryCoords[0], baryCoords[1], baryCoords[2]);

            e1 = 0; e2 = 0; e3 = 0; e4 = 0;
            if (colorIdx === 0) { e1 = 1.0; e2 = intens[0]; e3 = intens[1]; e4 = intens[2]; }
            else if (colorIdx === 1) { e2 = 1.0; e3 = intens[0]; e4 = intens[1]; e1 = intens[2]; }
            else if (colorIdx === 2) { e3 = 1.0; e4 = intens[0]; e1 = intens[1]; e2 = intens[2]; }
            else if (colorIdx === 3) { e4 = 1.0; e1 = intens[0]; e2 = intens[1]; e3 = intens[2]; }

            if (pattern === 'tess_macro_a_center') {
                let zPulse = (Math.sin(theta) + 1.0) / 2.0; 
                zPulse *= ((orbitRadiusX + orbitRadiusY) / 2.0); 
                e1 += (1.0 - e1) * zPulse; e2 += (1.0 - e2) * zPulse;
                e3 += (1.0 - e3) * zPulse; e4 += (1.0 - e4) * zPulse;
            }

        } else if (engine === 'intensity') {
            const baseE1 = Math.max(0, Math.min(1, (1.0 - effY) * 2.0));
            const baseE2 = Math.max(0, Math.min(1, effX * 2.0));
            const baseE3 = Math.max(0, Math.min(1, effY * 2.0));
            const baseE4 = Math.max(0, Math.min(1, (1.0 - effX) * 2.0));

            e1 = Math.max(0, Math.min(1, baseE1 * s1));
            e2 = Math.max(0, Math.min(1, baseE2 * s2));
            e3 = Math.max(0, Math.min(1, baseE3 * s3));
            e4 = Math.max(0, Math.min(1, baseE4 * s4));

            actualX = 0.5 + (e2 - e4) / 2.0; actualY = 0.5 + (e3 - e1) / 2.0;
        } else {
            const virtualX = (s2 - s4); 
            const virtualY = (s3 - s1); 
            actualX = Math.max(-0.25, Math.min(1.25, effX + virtualX));
            actualY = Math.max(-0.25, Math.min(1.25, effY + virtualY));

            e1 = Math.max(0, Math.min(1, (1.0 - actualY) * 2.0));
            e2 = Math.max(0, Math.min(1, actualX * 2.0));
            e3 = Math.max(0, Math.min(1, actualY * 2.0));
            e4 = Math.max(0, Math.min(1, (1.0 - actualX) * 2.0));
        }

        const master = parseFloat(this.masterVol.value) / 100.0;
        const v1 = e1 * master; const v2 = e2 * master;
        const v3 = e3 * master; const v4 = e4 * master;

        // --- RENDER CANVAS ---
        const w = this.canvas.width, h = this.canvas.height;
        this.ctx.fillStyle = '#111'; this.ctx.fillRect(0, 0, w, h);
        
        const L = 350; 
        const offX = (w - L) / 2; const offY = (h - L) / 2;

        this.ctx.save();
        this.ctx.translate(offX, offY);
        
        if (this.activeViewMode === 'barycentric') {
            const scale = L / 4; 
            
            TRIANGLES.forEach(t => {
                let center = triangleCenter(t.u, t.v, t.up);
                let basis = triangleBasis(t.u, t.v, t.up);
                let colorIdx = triangleColorIndex(t.u, t.v, t.up);

                this.ctx.fillStyle = BARY_COLORS[colorIdx];
                this.ctx.beginPath();
                this.ctx.moveTo((center[0] + basis[0][0]) * scale, L - (center[1] + basis[0][1]) * scale);
                this.ctx.lineTo((center[0] + basis[1][0]) * scale, L - (center[1] + basis[1][1]) * scale);
                this.ctx.lineTo((center[0] + basis[2][0]) * scale, L - (center[1] + basis[2][1]) * scale);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.strokeStyle = '#222'; this.ctx.lineWidth = 1; this.ctx.stroke();
            });

            this.ctx.fillStyle = 'rgba(200, 200, 200, 0.5)';
            TRIANGLES.forEach(t => {
                let center = triangleCenter(t.u, t.v, t.up);
                let basis = triangleBasis(t.u, t.v, t.up);
                
                let cx = center[0] * scale; let cy = L - center[1] * scale;
                let v0x = (center[0] + basis[0][0]) * scale, v0y = L - (center[1] + basis[0][1]) * scale;
                let v1x = (center[0] + basis[1][0]) * scale, v1y = L - (center[1] + basis[1][1]) * scale;
                let v2x = (center[0] + basis[2][0]) * scale, v2y = L - (center[1] + basis[2][1]) * scale;

                let m1x = (v0x + v1x) / 2, m1y = (v0y + v1y) / 2;
                let m2x = (v1x + v2x) / 2, m2y = (v1y + v2y) / 2;
                let m3x = (v2x + v0x) / 2, m3y = (v2y + v0y) / 2;

                this.ctx.beginPath(); this.ctx.arc(cx, cy, 2, 0, Math.PI * 2); this.ctx.fill();     
                this.ctx.beginPath(); this.ctx.arc(m1x, m1y, 2, 0, Math.PI * 2); this.ctx.fill();   
                this.ctx.beginPath(); this.ctx.arc(m2x, m2y, 2, 0, Math.PI * 2); this.ctx.fill();   
                this.ctx.beginPath(); this.ctx.arc(m3x, m3y, 2, 0, Math.PI * 2); this.ctx.fill();   
            });

            this.wCtx.fillStyle = '#111'; this.wCtx.fillRect(0, 0, this.waterCanvas.width, this.waterCanvas.height);
            const ww = this.waterCanvas.width; const wh = this.waterCanvas.height; const barW = ww / 4;
            
            const levels = [
                { val: v1, color: '#FE2E2E', bg: '#401010', label: 'A' },
                { val: v2, color: '#5463FF', bg: '#101540', label: 'B' },
                { val: v3, color: '#FFC717', bg: '#403010', label: 'C' },
                { val: v4, color: '#1F9E40', bg: '#103015', label: 'D' }
            ];
            
            levels.forEach((lvl, i) => {
                let x = i * barW; let y = 0;
                this.wCtx.fillStyle = lvl.bg; this.wCtx.fillRect(x, y, barW, wh);
                let fillHeight = lvl.val * wh;
                this.wCtx.fillStyle = lvl.color; this.wCtx.fillRect(x, wh - fillHeight, barW, fillHeight);
                this.wCtx.fillStyle = '#fff'; this.wCtx.font = 'bold 16px sans-serif';
                this.wCtx.textAlign = 'center'; this.wCtx.textBaseline = 'middle';
                this.wCtx.fillText(lvl.label, x + barW/2, y + wh/2 - 8);
                this.wCtx.font = '12px sans-serif';
                this.wCtx.fillText(Math.round(lvl.val * 100) + '%', x + barW/2, y + wh/2 + 8);
                this.wCtx.strokeStyle = '#222'; this.wCtx.lineWidth = 1; this.wCtx.strokeRect(x, y, barW, wh);
            });

        } else {
            const pad = 25; 
            this.ctx.strokeStyle = '#333'; this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(L/2, pad); this.ctx.lineTo(L-pad, L/2); this.ctx.lineTo(L/2, L-pad); this.ctx.lineTo(pad, L/2); this.ctx.closePath(); 
            this.ctx.stroke();
            this.ctx.beginPath(); this.ctx.moveTo(L/2, pad); this.ctx.lineTo(L/2, L-pad); this.ctx.moveTo(pad, L/2); this.ctx.lineTo(L-pad, L/2); this.ctx.stroke();
            this.ctx.beginPath(); this.ctx.moveTo(pad, pad); this.ctx.lineTo(L-pad, L-pad); this.ctx.moveTo(L-pad, pad); this.ctx.lineTo(pad, L-pad); this.ctx.stroke();

            this.ctx.font = 'bold 18px sans-serif'; this.ctx.textBaseline = 'middle'; this.ctx.textAlign = 'center';
            this.ctx.fillStyle = 'rgb(254, 46, 46)';  this.ctx.fillText('A', L/2, 12);
            this.ctx.fillStyle = 'rgb(84, 99, 255)';  this.ctx.fillText('B', L - 12, L/2);
            this.ctx.fillStyle = 'rgb(255, 199, 23)'; this.ctx.fillText('C', L/2, L - 12);
            this.ctx.fillStyle = 'rgb(31, 158, 64)';  this.ctx.fillText('D', 12, L/2);

            const drawRadius = (L / 2) - 45; 
            const electrodes = [
                { id: 'A', angle: -Math.PI / 2, intensity: v1, color: '254, 46, 46' },
                { id: 'B', angle: 0,            intensity: v2, color: '84, 99, 255' },
                { id: 'C', angle: Math.PI / 2,  intensity: v3, color: '255, 199, 23' },
                { id: 'D', angle: Math.PI,      intensity: v4, color: '31, 158, 64' }
            ];

            electrodes.forEach(el => {
                const ex = (L / 2) + drawRadius * Math.cos(el.angle);
                const ey = (L / 2) + drawRadius * Math.sin(el.angle); 
                this.ctx.beginPath(); this.ctx.arc(ex, ey, 10 + (25 * el.intensity), 0, 2 * Math.PI);
                this.ctx.fillStyle = `rgba(${el.color}, ${0.1 + (el.intensity * 0.5)})`; this.ctx.fill();
                this.ctx.beginPath(); this.ctx.arc(ex, ey, 8, 0, 2 * Math.PI);
                this.ctx.fillStyle = `rgb(${el.color})`; this.ctx.fill();
                this.ctx.fillStyle = '#eee'; this.ctx.font = '12px sans-serif'; this.ctx.textAlign = 'center';
                this.ctx.fillText(Math.round(el.intensity * 100) + '%', ex, ey - 22);
            });
        }

        this.ctx.beginPath();
        this.ctx.arc(effX * L, effY * L, 12, 0, Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; this.ctx.lineWidth = 2; this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(actualX * L, actualY * L, 6, 0, Math.PI * 2);
        if (this.activeViewMode === 'barycentric') {
            const sumOther = (e1 + e2 + e3 + e4) - Math.max(e1, e2, e3, e4);
            const dotOpacity = Math.max(0, Math.min(1, 1 - (sumOther - 1) / 2));
            this.ctx.fillStyle = `rgba(0, 0, 0, ${dotOpacity})`; this.ctx.fill();
            this.ctx.strokeStyle = `rgba(255, 255, 255, ${dotOpacity})`; 
        } else {
            this.ctx.fillStyle = '#fff'; this.ctx.fill();
            this.ctx.strokeStyle = '#000'; 
        }
        this.ctx.lineWidth = 2; this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(effX * L, effY * L);
        this.ctx.lineTo(actualX * L, actualY * L);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; this.ctx.lineWidth = 1; this.ctx.stroke();

        this.ctx.restore();

        // --- Network Output & Recording Intercept ---
        if (this.ws && this.ws.readyState === WebSocket.OPEN && performance.now() - this.lastUpdate > this.STREAM_INTERVAL_MS) {
            this.lastUpdate = performance.now();
            const fmt = (val) => String(Math.round(val * 9999)).padStart(4, '0');
            
            // Helper function: Converts true slider values to a T-Code string ONLY if checked
            const getTcode = (selector, chkSelector, prefix, min, max, defaultVal) => {
                const chk = this.container.querySelector(chkSelector);
                if (!chk || !chk.checked) return ''; // Return empty string if box is unchecked
                
                const el = this.container.querySelector(selector);
                const val = el ? parseFloat(el.value) : defaultVal;
                const pct = (val - min) / (max - min);
                return ` ${prefix}${String(Math.round(pct * 9999)).padStart(4, '0')}`;
            };

            // Read modifiers using your updated limits and new checkbox targets
            const c0 = getTcode('.rsC0', '.chkC0', 'C0', 500, 2000, 2000);
            const p0 = getTcode('.rsP0', '.chkP0', 'P0', 10, 200, 50);
            const p1 = getTcode('.rsP1', '.chkP1', 'P1', 2, 20, 7);
            const p2 = getTcode('.rsP2', '.chkP2', 'P2', 0, 1, 0);
            const p3 = getTcode('.rsP3', '.chkP3', 'P3', 2, 20, 2);

            // Append only the active modifiers to the base T-Code string
            const cmd = `E1${fmt(e1)} E2${fmt(e2)} E3${fmt(e3)} E4${fmt(e4)} V0${fmt(master)}${c0}${p0}${p1}${p2}${p3}\n`;
            
            this.ws.send(cmd);

            if (window.isRecordingSession) {
                window.sessionData.push({
                    time: Math.round(performance.now() - window.sessionStartTime),
                    ws: this.wsAddress.value,
                    cmd: cmd.trim() 
                });
            }
        }
    }
}


// Expose the 4-Phase brain globally so the new index.html can spawn it
window.SpatialSequencer = SpatialSequencer;

/*
// ==========================================
// 3. MASTER RECORDER INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    
    // --- Master Recorder Logic ---
    const btnRecord = document.getElementById('btnMasterRecord');
    const statusTxt = document.getElementById('recordStatus');
    
    if (btnRecord) {
        btnRecord.addEventListener('click', () => {
            isRecordingSession = !isRecordingSession;
            
            if (isRecordingSession) {
                sessionData = [];
                sessionStartTime = performance.now();
                btnRecord.innerHTML = '⏹ Stop & Save Recording';
                btnRecord.style.background = '#f55'; // Red while recording
                btnRecord.style.color = '#fff';
                if (statusTxt) statusTxt.innerText = 'Recording live T-Code stream...';
            } else {
                btnRecord.innerHTML = '▶ Start Master Recording';
                btnRecord.style.background = '#0f9'; // Green when ready/stopped
                btnRecord.style.color = '#000';
                if (statusTxt) statusTxt.innerText = `Session saved with ${sessionData.length} data frames.`;
                
                if (sessionData.length > 0) {
                    const dataStr = JSON.stringify(sessionData, null, 2);
                    const blob = new Blob([dataStr], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `restim_session_${new Date().getTime()}.json`;
                    document.body.appendChild(a);
                    a.click();
                    
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }
            }
        });
    }
});
*/