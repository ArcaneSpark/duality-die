const MOD_ID = "duality-die";

// --- 1. DATA ENGINE ---
Hooks.once("init", () => {
    game.settings.register(MOD_ID, "fearLevel", {
        name: "Fear Pool",
        scope: "world",
        config: false,
        type: Number,
        default: 0,
            onChange: () => renderFearHUD()
    });
});

// --- 2. THE HUD ---
function renderFearHUD() {
    const current = game.settings.get(MOD_ID, "fearLevel");
    const max = 12;
    let hud = document.getElementById("fear-hud-v13");

    if (!hud) {
        hud = document.createElement("div");
        hud.id = "fear-hud-v13";
        hud.style.cssText = "position:fixed; top:80px; left:50%; transform:translateX(-50%); z-index:100; display:flex; flex-direction:column; align-items:center; pointer-events:all; cursor:grab; background:rgba(0,0,0,0.85); padding:10px 15px; border-radius:20px; border:2px solid #9e1b1b; box-shadow: 0 0 20px rgba(158,27,27,0.5);";
        document.body.appendChild(hud);

        let isDragging = false;
        hud.onmousedown = (e) => {
            if (e.target.classList.contains('fear-pip')) return;
            isDragging = true;
            let sx = e.clientX - hud.getBoundingClientRect().left;
            let sy = e.clientY - hud.getBoundingClientRect().top;
            document.onmousemove = (e) => {
                if (!isDragging) return;
                hud.style.left = e.clientX - sx + (hud.offsetWidth/2) + 'px';
                hud.style.top = e.clientY - sy + 'px';
            };
            document.onmouseup = () => { isDragging = false; document.onmousemove = null; };
        };
    }

    let pips = "";
    for (let i = 1; i <= max; i++) {
        const active = i <= current;
        pips += `<div class="fear-pip" data-idx="${i}" style="width:18px; height:18px; border-radius:50%; border:2px solid #444; margin:0 5px; cursor:pointer; background:${active ? 'radial-gradient(circle, #ff4d4d, #9e1b1b)' : '#222'}; box-shadow:${active ? '0 0 10px #ff0000' : 'none'};"></div>`;
    }

    hud.innerHTML = `<div style="color:#ff4d4d; font-family:serif; font-weight:bold; text-shadow:2px 2px black; letter-spacing:2px; margin-bottom:5px; pointer-events:none; user-select:none;">FEAR POOL</div><div style="display:flex;">${pips}</div>`;

    if (game.user.isGM) {
        hud.querySelectorAll('.fear-pip').forEach(p => {
            p.onclick = async (e) => {
                let idx = parseInt(e.target.dataset.idx);
                let newVal = (idx <= current) ? current - 1 : current + 1;
                let finalVal = Math.clamp(newVal, 0, max);

                // --- MANUAL CLICK LOGGING ---
                const direction = finalVal > current ? "increased" : "decreased";
                console.log(`%cDUALITY | GM manually ${direction} Fear Pool to ${finalVal}/${max}`, "color: #ff4d4d; font-weight: bold;");

                await game.settings.set(MOD_ID, "fearLevel", finalVal);
            };
        });
    }
}

// --- 3. DICE LOGIC ---
Hooks.on("createChatMessage", async (message, options, userId) => {
    if (game.user.id !== userId) return;
    const roll = message.rolls[0];
    if (!roll || !roll.terms.some(t => t.faces === 20)) return;

    const fearRoll = await new Roll("1d20").evaluate();
    await message.setFlag(MOD_ID, "fearResult", fearRoll.total);

    const hopeResult = roll.terms.find(t => t.faces === 20)?.results.find(r => r.active)?.result;
    const actor = game.actors.get(message.speaker.actor) || canvas.tokens.get(message.speaker.token)?.actor;

    // --- HOPE GAIN (Compatible with V4 Activities) ---
    if (hopeResult > fearRoll.total) {
        const actor = game.actors.get(message.speaker.actor) || canvas.tokens.get(message.speaker.token)?.actor;
        if (actor) {
            const hopeItem = actor.items.find(i => i.name.toLowerCase().includes("hope"));
            if (hopeItem) {
                // In the new system, we decrease 'spent' to 'gain' a use
                const currentSpent = Number(hopeItem.system.uses?.spent ?? 0);
                const newSpent = Math.max(0, currentSpent - 1); // Subtract 1 from spent to GAIN a charge

                await hopeItem.update({ "system.uses.spent": newSpent });

                const currentVal = (hopeItem.system.uses?.max ?? 0) - newSpent;
                ui.notifications.info(`${actor.name} gained Hope! (${currentVal}/${hopeItem.system.uses?.max})`);
                console.log(`DUALITY | ${actor.name} gained Hope! (${currentVal}/${hopeItem.system.uses?.max})`);
            }
        }
    }
    else if (fearRoll.total > hopeResult) {
        const currentFear = game.settings.get(MOD_ID, "fearLevel");
        const maxFear = 12;
        const newFear = Math.min(currentFear + 1, maxFear);

        if (currentFear !== newFear) {
            await game.settings.set(MOD_ID, "fearLevel", newFear);
            ui.notifications.warn(`The Fear Pool grows... (${newFear}/${maxFear})`);
            console.warn(`DUALITY | The Fear Pool grew! (${newFear}/${maxFear})`);
        }
    }
    else {
        console.log("DUALITY | A tie! Chaos reigns.");
    }
});

// --- 4. CHAT DISPLAY ---
Hooks.on("renderChatMessageHTML", (message, html) => {
    const fearResult = message.getFlag(MOD_ID, "fearResult");
    if (fearResult === undefined) return;

    const roll = message.rolls[0];
    const hopeResult = roll?.terms.find(t => t.faces === 20)?.results.find(r => r.active)?.result;
    if (hopeResult === undefined) return;

    let color = (hopeResult > fearResult) ? "#2a52be" : (fearResult > hopeResult) ? "#9e1b1b" : "#7a7a7a";
    let label = (hopeResult > fearResult) ? "ROLLED WITH HOPE" : (fearResult > hopeResult) ? "ROLLED WITH FEAR" : "CHAOS";

    const div = document.createElement("div");
    div.style.cssText = `margin-top:10px; border:2px solid ${color}; border-radius:4px; overflow:hidden; background:rgba(255,255,255,0.05);`;
    div.innerHTML = `
    <div style="background:${color}; color:white; font-size:0.75rem; font-weight:bold; padding:2px 5px; text-align:center;">${label}</div>
    <div style="display:flex; justify-content:space-around; padding:10px 5px; font-size:1.5rem; font-weight:bold;">
    <div style="text-align:center;"><div style="font-size:0.6rem; color:#2a52be;">HOPE</div><div>${hopeResult}</div></div>
    <div style="font-size:1rem; color:#7a7971; opacity:0.5; align-self:center;">VS</div>
    <div style="text-align:center;"><div style="font-size:0.6rem; color:#9e1b1b;">FEAR</div><div>${fearResult}</div></div>
    </div>`;

    const content = html instanceof HTMLElement ? html : html[0];
    const target = content.querySelector(".dice-roll") || content.querySelector(".message-content");
    if (target) target.appendChild(div);
});

Hooks.on("ready", renderFearHUD);
