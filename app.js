const { createApp, ref, computed, onMounted, watch } = Vue;

createApp({
    setup() {
        const generateId = () => '_' + Math.random().toString(36).substr(2, 9);

        const getBlankChar = () => ({
            id: generateId(), name: "", pantheon: "Greek", parent: "",
            alignment: "", gender: "", age: "", image: "",
            stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
            startingAp: 3, skills: [],
            equippedWeapon: "Sword", equippedArmour: "Unarmoured",
            wounds: "Healthy", fatigue: 0, potd: Array(6).fill(true), learnedAbilities: []
        });

        const char = ref(getBlankChar());
        const roster = ref([]);
        const currentMode = ref("edit");
        
        const shopOpen = ref(true);
        const manageModalOpen = ref(false);
        const isUnleashed = ref(false);
        
        const newSkillName = ref("");
        const newSkillStat = ref("str");
        
        const apPromptActive = ref(false);
        const apConfirmationMessage = ref(false);
        const saveIndicator = ref(false);
        let saveTimeout = null;

        // Phase 1: Deep Watcher for Auto-Saving Data Flow
        watch(char, (newVal) => {
            const idx = roster.value.findIndex(r => r.id === newVal.id);
            if (idx !== -1) {
                roster.value[idx] = JSON.parse(JSON.stringify(newVal));
            } else {
                roster.value.push(JSON.parse(JSON.stringify(newVal)));
            }
            localStorage.setItem('myth_roster', JSON.stringify(roster.value));

            // Trigger UI save indicator
            saveIndicator.value = true;
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => { saveIndicator.value = false; }, 1500);
        }, { deep: true });

        // Computeds & Evaluators
        const totalStats = computed(() => {
            return Object.values(char.value.stats).reduce((a, b) => a + b, 0);
        });

        // Phase 2: AP Consistency & Formula Auditing
        const spentAp = computed(() => {
            return char.value.learnedAbilities.reduce((sum, ab) => sum + (ab.tier || 0), 0);
        });

        const remainingAp = computed(() => {
            return char.value.startingAp - spentAp.value;
        });

        const effectiveDex = computed(() => {
            const armor = armourRegistry.find(a => a.tier === char.value.equippedArmour);
            const penalty = armor ? armor.penalty : 0;
            return Math.max(1, char.value.stats.dex + penalty);
        });

        const calculatedProficiency = computed(() => {
            // Updated to scale off startingAp instead of totalAp
            return 2 + Math.floor(Math.max(0, char.value.startingAp - 3) / 4);
        });

        const availableGods = computed(() => {
            return pantheons[char.value.pantheon] || [];
        });

        const activeWeapon = computed(() => {
            return weaponArsenal.find(w => w.type === char.value.equippedWeapon) || null;
        });

        // Phase 7: Ability Filters & Exclusion
        const filteredShopAbilities = computed(() => {
            const parentGod = availableGods.value.find(g => g.name === char.value.parent);
            if (!parentGod) return [];
            const domains = [parentGod.primary, parentGod.secondary, ...(parentGod.tertiary || [])].map(d => d.trim().toLowerCase());
            
            return abilitiesLibrary.filter(ab => {
                // Exclude abilities the character has already learned
                const alreadyLearned = char.value.learnedAbilities.some(learned => learned.name === ab.name);
                if (alreadyLearned) return false;

                const abDomains = ab.domains.split(',').map(d => d.trim().toLowerCase());
                return abDomains.some(d => domains.includes(d));
            });
        });

        // Mechanics & Logic Modifications
        const calcMod = (score) => Math.floor((score - 10) / 2);
        const formatModifier = (mod) => mod >= 0 ? `+${mod}` : mod;
        const statFullName = (stat) => ({ str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }[stat]);

        const adjustStat = (stat, amount) => {
            if (amount > 0) {
                // Phase 3: Stat Constraints (capped at 85)
                if (totalStats.value >= 85) return;
                if (char.value.stats[stat] >= 20) return;
            }
            const nextVal = char.value.stats[stat] + amount;
            if (nextVal >= 1 && nextVal <= 20) char.value.stats[stat] = nextVal;
        };

        const randomizeStats = () => {
            const roll5d4 = () => Array.from({ length: 5 }, () => Math.floor(Math.random() * 4) + 1).reduce((a, b) => a + b, 0);
            Object.keys(char.value.stats).forEach(s => {
                char.value.stats[s] = roll5d4();
            });
        };

        // Phase 7: Demigod Demographics & Age Engines
        const randomizeAll = () => {
            randomizeStats();
            const pKeys = Object.keys(pantheons);
            if (pKeys.length) {
                char.value.pantheon = pKeys[Math.floor(Math.random() * pKeys.length)];
                const gods = pantheons[char.value.pantheon];
                if (gods && gods.length) {
                    char.value.parent = gods[Math.floor(Math.random() * gods.length)].name;
                }
            }
            const alignments = ["Lawful", "Neutral", "Chaotic"];
            char.value.alignment = alignments[Math.floor(Math.random() * alignments.length)];
            char.value.gender = Math.random() > 0.5 ? "Male" : "Female";
            
            // Age Curve Calibration
            const ageCheck = Math.random();
            if (ageCheck <= 0.98) {
                char.value.age = Math.random() < 0.70 
                    ? Math.floor(Math.random() * 8) + 14   // 14 to 21
                    : Math.floor(Math.random() * 9) + 22;  // 22 to 30
            } else {
                char.value.age = Math.floor(Math.random() * 70) + 31; // 31 to 100
            }
        };

        const changePantheon = (e) => {
            char.value.pantheon = e.target.value;
            char.value.parent = "";
        };

        const changeParent = (e) => {
            char.value.parent = e.target.value;
        };

        const setWoundState = (state) => { char.value.wounds = state; };
        const getWoundClass = (state) => {
            const colors = { Healthy: 'bg-green-700/20 text-green-900 border-green-700', Bruised: 'bg-yellow-600/20 text-yellow-900 border-yellow-600', Bleeding: 'bg-orange-600/20 text-orange-900 border-orange-600', Broken: 'bg-red-600/20 text-red-900 border-red-600', Dead: 'bg-black text-white border-black' };
            return char.value.wounds === state ? `${colors[state]} ring-2 ring-offset-1 ring-black/40` : 'bg-white/40 text-gray-700 hover:bg-white/60';
        };

        const getFatigueClass = (level) => {
            const colors = ['bg-green-700/20 text-green-900', 'bg-yellow-600/20 text-yellow-900', 'bg-orange-500/20 text-orange-900', 'bg-orange-700/20 text-orange-900', 'bg-red-700/20 text-red-900', 'bg-black text-white'];
            return char.value.fatigue === level ? `${colors[level]} ring-2 ring-offset-1 ring-black/40 border-black` : 'bg-white/40 text-gray-700 hover:bg-white/60';
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
            const arm = armourRegistry.find(a => a.tier === char.value.equippedArmour);
            return (arm ? arm.bonus : 0) + Math.floor(effectiveDex.value / 2) + calculatedProficiency.value + calcMod(char.value.stats.wis);
        };
        const calcAttackBonus = (w) => {
            if (!w) return 0;
            const relevantStatValue = w.ability.toLowerCase() === 'str' ? char.value.stats.str : effectiveDex.value;
            return calcMod(relevantStatValue) + calculatedProficiency.value;
        };

        const adjustTotalAp = (amount) => {
            const nextVal = char.value.startingAp + amount;
            if (nextVal >= 0) {
                char.value.startingAp = nextVal;
            }
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
        const replenishPotd = () => { char.value.potd = Array(6).fill(true); };

        const useAbilityInPlay = (ab) => {
            if (currentMode.value !== 'play') return;
            let cost = ab.tier;
            for (let i = 0; i < cost; i++) {
                const idx = char.value.potd.lastIndexOf(true);
                if (idx !== -1) {
                    char.value.potd[idx] = false;
                }
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
            if (idx !== -1) {
                char.value.learnedAbilities.splice(idx, 1);
            }
        };

        const triggerUnleash = () => { isUnleashed.value = true; };
        
        // Phase 7: Security Lockouts
        const enterPlayMode = () => {
            if (window.confirm("Warning: Entering Play Mode will seal character generation variables. Ensure your choices are finalized. Proceed?")) {
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

        // Roster Management (saveToRoster logic migrated to deep watch hook)
        const loadCharacter = (id) => {
            const target = roster.value.find(r => r.id === id);
            if (target) {
                let parsed = JSON.parse(JSON.stringify(target));
                // AP structure migration logic for backwards compatibility
                if (parsed.startingAp === undefined) {
                    parsed.startingAp = parsed.totalAp !== undefined ? parsed.totalAp : 3;
                    delete parsed.totalAp;
                    delete parsed.baseAp;
                }
                char.value = parsed;
            }
        };

        const deleteCharacter = (id) => {
            roster.value = roster.value.filter(r => r.id !== id);
            localStorage.setItem('myth_roster', JSON.stringify(roster.value));
            if (char.value.id === id) char.value = getBlankChar();
        };

        const createNewCharacter = () => {
            char.value = getBlankChar();
            currentMode.value = 'edit';
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
                        
                        const migrate = (c) => {
                            if (c.startingAp === undefined) {
                                c.startingAp = c.totalAp !== undefined ? c.totalAp : 3;
                                delete c.totalAp;
                                delete c.baseAp;
                            }
                            return c;
                        };

                        if (Array.isArray(raw)) {
                            roster.value = raw.map(migrate);
                            if (raw.length) char.value = JSON.parse(JSON.stringify(roster.value[0]));
                        } else if (raw && raw.id) {
                            const migratedRaw = migrate(raw);
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
                roster.value = JSON.parse(cached).map(c => {
                    // Quick migration check
                    if (c.startingAp === undefined) {
                        c.startingAp = c.totalAp !== undefined ? c.totalAp : 3;
                        delete c.totalAp;
                        delete c.baseAp;
                    }
                    return c;
                });
                if (roster.value.length) char.value = JSON.parse(JSON.stringify(roster.value[0]));
            }
        });

        return {
            char, roster, currentMode, shopOpen, manageModalOpen, isUnleashed, newSkillName, newSkillStat,
            apPromptActive, apConfirmationMessage, saveIndicator, pantheons, woundStates, fatigueStates, weaponArsenal,
            armourRegistry, totalStats, effectiveDex, calculatedProficiency, availableGods, activeWeapon,
            filteredShopAbilities, calcMod, formatModifier, statFullName, adjustStat, randomizeStats,
            randomizeAll, changePantheon, changeParent, setWoundState, getWoundClass, getFatigueClass,
            addSkill, removeSkill, toggleSkillTick, calcDefenseBonus, calcAttackBonus, adjustTotalAp,
            handleApClick, decreaseActivePotd, increaseActivePotd, togglePotd, replenishPotd,
            executePurchase, refundAbility, triggerUnleash, enterPlayMode, handleImageUpload,
            createNewCharacter, editCharacter, loadCharacter, deleteCharacter, printSheet,
            importData, exportCurrent, exportAll, useAbilityInPlay, spentAp, remainingAp, weaponTraits, weaponEffects
        };
    }
}).mount('#app');