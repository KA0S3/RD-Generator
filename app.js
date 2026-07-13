if (typeof window.weaponTraits === 'undefined') {
    window.weaponTraits = {};
}
Object.assign(weaponTraits, {
    "Quick": "Drawing or stowing the shield does not require a Minor Action.",
    "Light": "Does not interfere with Dexterity-based weapons.",
    "Standard": "Functions as described in the Shield/Cover rules.",
    "Cover": "While using the Brace action, allies directly behind you benefit from Partial Cover.",
    "Brace": "While Braced, increase the Defence Bonus to +3 against attacks originating from your front."
});

if (typeof window.weaponArsenal === 'undefined') {
    window.window.weaponArsenal = [];
}
weaponArsenal.push(
    { type: "Buckler", bonus: "N/A", range: "Melee", ability: "N/A", traits: ["Quick", "Light"], effects: [], dbBonus: 1 },
    { type: "Shield", bonus: "N/A", range: "Melee", ability: "N/A", traits: ["Standard"], effects: [], dbBonus: 2 },
    { type: "Tower Shield", bonus: "N/A", range: "Melee", ability: "N/A", traits: ["Heavy", "Cover", "Brace"], effects: [], dbBonus: 2 }
);

const { createApp, ref, computed, onMounted, watch } = Vue;

const app = createApp({
    setup() {
        // --- 1. Base Setup & Data Structures ---
        const generateId = () => '_' + Math.random().toString(36).substr(2, 9);

        const getBlankChar = () => ({
            id: generateId(),
            name: "",
            image: "",
            pantheon: "Greek",
            parent: "",
            alignment: "",
            gender: "",
            age: "",
            equippedArmour: "Unarmoured",
            equippedWeapons: ["", ""],
            stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
            skills: [],
            potd: [true, true, true, true, true, true],
            wounds: "Healthy",
            fatigue: 0,
            learnedAbilities: [],
            items: [],
            backstory: "",
            relations: [],
            startingAp: 3,
            notes: ""
        });

        // --- 2. State References ---
        const char = ref(getBlankChar());
        const roster = ref([]);
        const currentMode = ref("edit");
        
        const currentTheme = ref("mythic");
        const saveIndicator = ref(false);
        const manageModalOpen = ref(false);
        const isUnleashed = ref(false);
        const shopOpen = ref(false);
        const apPromptActive = ref(false);
        const apConfirmationMessage = ref(false);
        
        const chosenFilterTier = ref("All");
        const storeFilterTier = ref("All");
        
        const newSkillName = ref("");
        const newSkillStat = ref("str");
        const newItemName = ref("");
        const newRelationName = ref("");

        let saveTimeout = null;

        // --- 3. Watchers ---
        watch(char, (newVal) => {
            const idx = roster.value.findIndex(r => r.id === newVal.id);
            if (idx !== -1) {
                roster.value[idx] = JSON.parse(JSON.stringify(newVal));
            } else {
                roster.value.push(JSON.parse(JSON.stringify(newVal)));
            }
            localStorage.setItem('myth_roster', JSON.stringify(roster.value));

            saveIndicator.value = true;
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => { saveIndicator.value = false; }, 1500);
        }, { deep: true });

        // --- 4. Computed Properties ---
        const totalStats = computed(() => Object.values(char.value.stats).reduce((a, b) => a + b, 0));
        const spentAp = computed(() => char.value.learnedAbilities.reduce((sum, ab) => sum + (ab.tier || 0), 0));
        const remainingAp = computed(() => char.value.startingAp - spentAp.value);

        const effectiveDex = computed(() => {
            const armor = typeof armourRegistry !== 'undefined' ? armourRegistry.find(a => a.tier === char.value.equippedArmour) : null;
            const penalty = armor && armor.penalty ? armor.penalty : 0;
            return Math.max(1, char.value.stats.dex + penalty);
        });

        const calculatedProficiency = computed(() => {
            return 2 + Math.floor(Math.max(0, char.value.startingAp - 3) / 4);
        });

        const availableGods = computed(() => {
            return typeof pantheons !== 'undefined' ? (pantheons[char.value.pantheon] || []) : [];
        });

        const activeWeapons = computed(() => {
            if (typeof weaponArsenal === 'undefined') return [null, null];
            return char.value.equippedWeapons.map(wType => weaponArsenal.find(w => w.type === wType) || null);
        });

        const filteredShopAbilities = computed(() => {
            const parentGod = availableGods.value.find(g => g.name === char.value.parent);
            if (!parentGod || typeof abilitiesLibrary === 'undefined') return [];
            const domains = [parentGod.primary, parentGod.secondary, ...(parentGod.tertiary || [])].filter(Boolean).map(d => d.trim().toLowerCase());
            
            return abilitiesLibrary.filter(ab => {
                const alreadyLearned = char.value.learnedAbilities.some(learned => learned.name === ab.name);
                if (alreadyLearned) return false;
                const abDomains = ab.domains.split(',').map(d => d.trim().toLowerCase());
                return abDomains.some(d => domains.includes(d));
            });
        });

        const currentWoundDescription = computed(() => {
            if (typeof woundStates === 'undefined') return "";
            const w = woundStates.find(x => x.state === char.value.wounds);
            return w ? w.description : "No description available.";
        });

        const currentFatigueName = computed(() => {
            if (typeof fatigueStates === 'undefined') return "Fresh";
            const f = fatigueStates.find(x => x.level === char.value.fatigue);
            return f ? f.state : "Fresh";
        });

        const currentFatigueDescription = computed(() => {
            if (typeof fatigueStates === 'undefined') return "";
            const f = fatigueStates.find(x => x.level === char.value.fatigue);
            return f ? f.description : "No description available.";
        });
		
		const weaponAttackBonuses = computed(() => {
            // We map through both equipped weapon slots
            return activeWeapons.value.map(weapon => {
                // If it's a shield (ability is N/A), return a dash to ignore it
                if (weapon && weapon.ability === "N/A") {
                    return "-";
                }

                let useDex = true; // Defaults to DEX for Finesse or Unarmed
                
                // If a weapon is equipped and uses STR, switch to STR
                if (weapon && weapon.ability) {
                    const abilityStr = weapon.ability.toLowerCase();
                    if (abilityStr.includes('str')) {
                        useDex = false;
                    }
                }

                // Grab the correct score and apply the math
                const statScore = useDex ? effectiveDex.value : char.value.stats.str;
                const statModifier = calcMod(statScore);

                // formatModifier handles the + or - signs perfectly
                return formatModifier(statModifier + calculatedProficiency.value);
            });
        });

        // --- 5. Mechanics & Helpers ---
        const calcMod = (score) => Math.floor((score - 10) / 2);
        const formatModifier = (mod) => mod >= 0 ? `+${mod}` : mod;
        const statFullName = (stat) => ({ str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }[stat]);

        const adjustStat = (stat, amount) => {
            if (amount > 0) {
                if (totalStats.value >= 85) return;
                if (char.value.stats[stat] >= 20) return;
            }
            const nextVal = char.value.stats[stat] + amount;
            if (nextVal >= 1 && nextVal <= 20) char.value.stats[stat] = nextVal;
        };

        const randomizeStats = () => {
            const roll5d4 = () => Array.from({ length: 5 }, () => Math.floor(Math.random() * 4) + 1).reduce((a, b) => a + b, 0);
            Object.keys(char.value.stats).forEach(s => { char.value.stats[s] = roll5d4(); });
        };

        const randomizeAll = () => {
            randomizeStats();
            
            // Add this to your randomize properties list
            if (typeof armourRegistry !== 'undefined' && armourRegistry.length > 0) {
                char.value.equippedArmour = armourRegistry[Math.floor(Math.random() * armourRegistry.length)].tier;
            }
            
            if (typeof pantheons !== 'undefined') {
                const pKeys = Object.keys(pantheons);
                if (pKeys.length) {
                    char.value.pantheon = pKeys[Math.floor(Math.random() * pKeys.length)];
                    const gods = pantheons[char.value.pantheon];
                    if (gods && gods.length) char.value.parent = gods[Math.floor(Math.random() * gods.length)].name;
                }
            }
            const alignments = ["Lawful Good", "True Neutral", "Chaotic Good", "Neutral Good", "Chaotic Neutral"];
            char.value.alignment = alignments[Math.floor(Math.random() * alignments.length)];
            char.value.gender = Math.random() > 0.5 ? "Male" : "Female";
            
            const ageCheck = Math.random();
            if (ageCheck <= 0.98) {
                char.value.age = Math.random() < 0.70 
                    ? Math.floor(Math.random() * 8) + 14
                    : Math.floor(Math.random() * 9) + 22;
            } else {
                char.value.age = Math.floor(Math.random() * 70) + 31;
            }

            if (typeof randomNames !== 'undefined' && randomNames.length > 0) {
                char.value.name = randomNames[Math.floor(Math.random() * randomNames.length)];
            } else {
                char.value.name = "Unknown Hero";
            }

            if (typeof weaponArsenal !== 'undefined' && weaponArsenal.length > 0) {
                const w1 = weaponArsenal[Math.floor(Math.random() * weaponArsenal.length)].type;
                const w2 = Math.random() > 0.5 ? weaponArsenal[Math.floor(Math.random() * weaponArsenal.length)].type : "";
                char.value.equippedWeapons = [w1, w2];
            }
        };

        const changePantheon = (e) => {
            char.value.pantheon = e.target.value;
            char.value.parent = "";
        };

        const changeParent = (e) => { char.value.parent = e.target.value; };
        const setWoundState = (state) => { char.value.wounds = state; };
        
        const getWoundClass = (state) => {
            const colors = { Healthy: 'bg-green-900/40 text-green-300 border-green-700', Bruised: 'bg-yellow-700/40 text-yellow-300 border-yellow-600', Bleeding: 'bg-orange-800/40 text-orange-300 border-orange-600', Broken: 'bg-red-900/50 text-red-300 border-red-600', Dead: 'bg-black text-red-700 border-red-900 font-black' };
            return char.value.wounds === state ? `${colors[state]} ring-2 ring-offset-1 ring-offset-[#1a140f] ring-[#8b6d43]` : 'bg-black/20 text-[#8b6d43] border-[#4a3a2a] hover:bg-black/40 hover:text-[#d6c6ad]';
        };

        const getFatigueClass = (level) => {
            const colors = ['bg-green-900/40 text-green-300 border-green-700', 'bg-yellow-700/40 text-yellow-300 border-yellow-600', 'bg-orange-700/40 text-orange-300 border-orange-600', 'bg-orange-900/60 text-orange-400 border-orange-700', 'bg-red-900/60 text-red-300 border-red-700', 'bg-black text-red-700 border-red-900 font-black'];
            return char.value.fatigue === level ? `${colors[level]} ring-2 ring-offset-1 ring-offset-[#1a140f] ring-[#8b6d43]` : 'bg-black/20 text-[#8b6d43] border-[#4a3a2a] hover:bg-black/40 hover:text-[#d6c6ad]';
        };

        const addSkill = () => {
            if (newSkillName.value.trim()) {
                char.value.skills.push({ name: newSkillName.value.trim(), stat: newSkillStat.value, ticks: 0 });
                newSkillName.value = "";
            }
        };
        const removeSkill = (idx) => { char.value.skills.splice(idx, 1); };
        const toggleSkillTick = (idx) => {
            const s = char.value.skills[idx];
            s.ticks = s.ticks < 3 ? s.ticks + 1 : 0;
        };
        
        const calcDefenseBonus = () => {
            // 1. Existing base math (Armor + Half DEX + Prof + WIS mod)
            let armorData = typeof armourRegistry !== 'undefined' ? armourRegistry.find(a => a.tier === char.value.equippedArmour) : null;
            let baseArmor = armorData ? armorData.bonus : 0;
            
            let dexMod = Math.floor(effectiveDex.value / 2);
            let wisMod = calcMod(char.value.stats.wis);
            
            let baseDB = baseArmor + dexMod + calculatedProficiency.value + wisMod;

            // 2. NEW: Add Shield Bonus
            let shieldBonus = 0;
            if (typeof weaponArsenal !== 'undefined') {
                char.value.equippedWeapons.forEach(w => {
                    let weaponData = weaponArsenal.find(wa => wa.type === w);
                    if (weaponData && weaponData.dbBonus) {
                        shieldBonus += weaponData.dbBonus;
                    }
                });
            }

            return baseDB + shieldBonus;
        };

        const adjustTotalAp = (amount) => {
            const nextVal = char.value.startingAp + amount;
            if (nextVal >= 0) char.value.startingAp = nextVal;
        };

        const handleApClick = () => {
            if (!apPromptActive.value) {
                apPromptActive.value = true;
            } else {
                apPromptActive.value = false;
                char.value.startingAp += 1;
                apConfirmationMessage.value = true;
                setTimeout(() => { apConfirmationMessage.value = false; }, 2000);
            }
        };

        const decreaseActivePotd = () => {
            const idx = char.value.potd.lastIndexOf(true);
            if (idx !== -1) char.value.potd[idx] = false;
        };
        const increaseActivePotd = () => {
            const idx = char.value.potd.indexOf(false);
            if (idx !== -1) char.value.potd[idx] = true;
        };
        const togglePotd = (idx) => { char.value.potd[idx] = !char.value.potd[idx]; };
        const replenishPotd = () => { char.value.potd = Array(char.value.potd.length).fill(true); };

        const useAbilityInPlay = (ab) => {
            if (currentMode.value !== 'play') return;
            let cost = ab.tier;
            for (let i = 0; i < cost; i++) {
                const idx = char.value.potd.lastIndexOf(true);
                if (idx !== -1) char.value.potd[idx] = false;
            }
        };

        const executePurchase = (ab) => {
            if (char.value.learnedAbilities.some(a => a.name === ab.name)) return;
            const cost = ab.tier; 
            if (remainingAp.value >= cost) {
                char.value.learnedAbilities.push({ ...ab, hideLabel: false });
            }
        };

        const refundAbility = (ab) => {
            const idx = char.value.learnedAbilities.findIndex(a => a.name === ab.name);
            if (idx !== -1) char.value.learnedAbilities.splice(idx, 1);
        };

        const triggerUnleash = () => { isUnleashed.value = true; };
        
        const enterPlayMode = () => {
            if (window.confirm("Warning: Entering Play Mode seals character generation variables. Proceed?")) {
                currentMode.value = 'play';
            }
        };

        const handleImageUpload = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => { char.value.image = event.target.result; };
                reader.readAsDataURL(file);
            }
        };

        const closeVault = () => {
            if (shopOpen.value) shopOpen.value = false;
        };

        const addItem = () => {
            if (newItemName.value.trim()) {
                if(!char.value.items) char.value.items = [];
                char.value.items.push(newItemName.value.trim());
                newItemName.value = "";
            }
        };
        
        const removeItem = (idx) => { char.value.items.splice(idx, 1); };

        const addRelation = () => {
            if (newRelationName.value.trim()) {
                if(!char.value.relations) char.value.relations = [];
                char.value.relations.push(newRelationName.value.trim());
                newRelationName.value = "";
            }
        };
        
        const removeRelation = (idx) => { char.value.relations.splice(idx, 1); };

        // --- 7. Save & Load Utilities ---
        const applyMigrations = (c) => {
            if (c.startingAp === undefined) {
                c.startingAp = c.totalAp !== undefined ? c.totalAp : 10;
                delete c.totalAp; delete c.baseAp;
            }
            if (!c.equippedWeapons && c.equippedWeapon) {
                c.equippedWeapons = [c.equippedWeapon, ""];
                delete c.equippedWeapon;
            } else if (!c.equippedWeapons) {
                c.equippedWeapons = ["", ""];
            }
            if (c.notes === undefined) c.notes = "";
            if (c.backstory === undefined) c.backstory = "";
            if (!c.items) c.items = [];
            if (!c.relations) c.relations = [];
            if (!c.potd) c.potd = [false, false, false];
            return c;
        };

        const loadCharacter = (id) => {
            const target = roster.value.find(r => r.id === id);
            if (target) char.value = applyMigrations(JSON.parse(JSON.stringify(target)));
        };

        const deleteCharacter = (id) => {
            roster.value = roster.value.filter(r => r.id !== id);
            localStorage.setItem('myth_roster', JSON.stringify(roster.value));
            if (char.value.id === id) char.value = getBlankChar();
        };

        const createNewCharacter = () => {
            char.value = getBlankChar();
            currentMode.value = 'edit';
            manageModalOpen.value = false;
        };

        const editCharacter = (id) => {
            loadCharacter(id);
            currentMode.value = 'edit';
            manageModalOpen.value = false;
        };

        const exportCurrent = () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(char.value));
            const dlNode = document.createElement('a');
            dlNode.setAttribute("href", dataStr);
            dlNode.setAttribute("download", `${char.value.name || "hero"}.json`);
            document.body.appendChild(dlNode);
            dlNode.click();
            dlNode.remove();
        };

        const exportAll = () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(roster.value));
            const dlNode = document.createElement('a');
            dlNode.setAttribute("href", dataStr);
            dlNode.setAttribute("download", "myth_roster_backup.json");
            document.body.appendChild(dlNode);
            dlNode.click();
            dlNode.remove();
        };

        const importData = (e) => {
            const files = e.target.files;
            if (!files.length) return;
            Array.from(files).forEach(f => {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    try {
                        const raw = JSON.parse(evt.target.result);
                        if (Array.isArray(raw)) {
                            roster.value = raw.map(applyMigrations);
                            if (raw.length) char.value = JSON.parse(JSON.stringify(roster.value[0]));
                        } else if (raw && raw.id) {
                            const migratedRaw = applyMigrations(raw);
                            const idx = roster.value.findIndex(r => r.id === migratedRaw.id);
                            if (idx !== -1) roster.value[idx] = migratedRaw;
                            else roster.value.push(migratedRaw);
                            char.value = JSON.parse(JSON.stringify(migratedRaw));
                        }
                        localStorage.setItem('myth_roster', JSON.stringify(roster.value));
                    } catch (err) { alert("Invalid structure"); }
                };
                reader.readAsText(f);
            });
        };

        const printSheet = () => { window.print(); };

        onMounted(() => {
            const cached = localStorage.getItem('myth_roster');
            if (cached) {
                roster.value = JSON.parse(cached).map(applyMigrations);
                if (roster.value.length) char.value = JSON.parse(JSON.stringify(roster.value[0]));
            }
        });

        // --- 8. Final Return to Template ---
        return {
            char, roster, currentMode, shopOpen, manageModalOpen, isUnleashed, newSkillName, newSkillStat,
            newItemName, newRelationName, apPromptActive, apConfirmationMessage, saveIndicator,
            pantheons: typeof pantheons !== 'undefined' ? pantheons : {}, 
            woundStates: typeof woundStates !== 'undefined' ? woundStates : [], 
            fatigueStates: typeof fatigueStates !== 'undefined' ? fatigueStates : [], 
            weaponArsenal: typeof weaponArsenal !== 'undefined' ? weaponArsenal : [],
            armourRegistry: typeof armourRegistry !== 'undefined' ? armourRegistry : [], 
            weaponTraits: typeof weaponTraits !== 'undefined' ? weaponTraits : {},     
            weaponEffects: typeof weaponEffects !== 'undefined' ? weaponEffects : {},   
            totalStats, effectiveDex, calculatedProficiency, currentWoundDescription, currentFatigueName, currentFatigueDescription,
            availableGods, activeWeapons, filteredShopAbilities, calcMod, formatModifier, statFullName, 
            adjustStat, randomizeStats, randomizeAll, changePantheon, changeParent, setWoundState, 
            getWoundClass, getFatigueClass, addSkill, removeSkill, toggleSkillTick, calcDefenseBonus, 
            adjustTotalAp, handleApClick, decreaseActivePotd, increaseActivePotd,
            togglePotd, replenishPotd, executePurchase, refundAbility, triggerUnleash, enterPlayMode, 
            handleImageUpload, createNewCharacter, editCharacter, loadCharacter, deleteCharacter, 
            printSheet, importData, exportCurrent, exportAll, useAbilityInPlay, spentAp, remainingAp,
            closeVault, addItem, removeItem, addRelation, removeRelation, storeFilterTier, chosenFilterTier, currentTheme, weaponAttackBonuses, 
        };
    }
});

// --- 9. Custom Directives ---
app.directive('click-outside', {
  mounted(el, binding) {
    el.clickOutsideEvent = function(event) {
      if (!(el === event.target || el.contains(event.target))) {
        binding.value(event);
      }
    };
    document.body.addEventListener('click', el.clickOutsideEvent);
  },
  unmounted(el) {
    document.body.removeEventListener('click', el.clickOutsideEvent);
  }
});

// Finally, mount the app
app.mount('#app');