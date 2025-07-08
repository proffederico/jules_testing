document.addEventListener('DOMContentLoaded', () => {
    // --- DATA & STATE ---
    const curriculum = {
        '1': ['Aritmetica e Algebra di Base', 'Geometria Euclidea Piana', 'Insiemi e Logica'],
        '2': ['Calcolo Letterale', 'Equazioni e Disequazioni di 1° grado', 'Statistica Descrittiva'],
        '3': ['Equazioni di 2° grado', 'Geometria Analitica: Retta e Parabola', 'Probabilità'],
        '4': ['Disequazioni di grado superiore', 'Logaritmi ed Esponenziali', 'Goniometria'],
        '5': ['Analisi: Limiti', 'Analisi: Derivate e Studio di Funzione', 'Analisi: Integrali']
    };

    const badgeSystem = {
        first_correct: { name: 'Primo Passo!', icon: '👟', condition: state => state.score >= 10 },
        streak_3: { name: 'Inarrestabile!', icon: '🔥', condition: state => state.streak >= 3 },
        streak_5: { name: 'Dominatore!', icon: '🚀', condition: state => state.streak >= 5 },
        score_100: { name: 'Centurione', icon: '💯', condition: state => state.score >= 100 },
    };

    function getInitialBadgesState() {
        const initialBadges = {};
        for (const key in badgeSystem) {
            initialBadges[key] = {
                ...badgeSystem[key],
                unlocked: false,
            };
        }
        return initialBadges;
    }

    const userApiKey = 'AIzaSyAvpfEvFPlDIkMYj-5Pok5uKrD1Cijl-jU';

    let state = {
        score: 0,
        streak: 0,
        badges: getInitialBadgesState(),
        currentProblem: null,
        isAnswered: false,
    };

    const problemSchema = {
        type: "OBJECT",
        properties: {
            testo: { type: "STRING", description: "Testo del problema. Usa LaTeX per le formule (es. $$...$$ o $...$)." },
            opzioni: { type: "ARRAY", items: { type: "STRING" }, description: "Array di 4 opzioni. Usa LaTeX se necessario." },
            risposta_corretta_index: { type: "NUMBER", description: "Indice (0-3) dell'opzione corretta." },
            spiegazione: { type: "STRING", description: "Spiegazione dettagliata della soluzione. Usa LaTeX." }
        },
        required: ["testo", "opzioni", "risposta_corretta_index", "spiegazione"]
    };

    // --- DOM ELEMENTS ---
    const yearSelect = document.getElementById('year-select');
    const topicSelect = document.getElementById('topic-select');
    const levelSelect = document.getElementById('level-select');
    const startBtn = document.getElementById('start-btn');
    const configSection = document.getElementById('config-section');
    const problemContainer = document.getElementById('problem-container');
    const loader = document.getElementById('loader');
    const problemContent = document.getElementById('problem-content');
    const problemText = document.getElementById('problem-text');
    const optionsContainer = document.getElementById('options-container');
    const resultArea = document.getElementById('result-area');
    const resultTitle = document.getElementById('result-title');
    const explanationArea = document.getElementById('explanation-area');
    const nextProblemBtn = document.getElementById('next-problem-btn');
    const newTopicBtn = document.getElementById('new-topic-btn');
    const gamificationHeader = document.getElementById('gamification-header');
    const scoreEl = document.getElementById('score');
    const streakEl = document.getElementById('streak');
    const badgesContainer = document.getElementById('badges-container');
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toast-icon');
    const toastText = document.getElementById('toast-text');

    // --- EVENT LISTENERS ---
    yearSelect.addEventListener('change', handleYearChange);
    topicSelect.addEventListener('change', handleTopicChange);
    startBtn.addEventListener('click', startSession);
    nextProblemBtn.addEventListener('click', fetchProblem);
    newTopicBtn.addEventListener('click', () => location.reload());

    // --- FUNCTIONS ---
    function handleYearChange() {
        const selectedYear = yearSelect.value;
        topicSelect.innerHTML = '<option>-- Seleziona prima un anno --</option>';
        topicSelect.disabled = true;
        if (selectedYear) {
            topicSelect.innerHTML = '<option value="">-- Seleziona un argomento --</option>';
            curriculum[selectedYear].forEach(topic => {
                const option = new Option(topic, topic);
                topicSelect.add(option);
            });
            topicSelect.disabled = false;
        }
        handleTopicChange();
    }

    function handleTopicChange() {
        startBtn.disabled = !topicSelect.value;
    }

    function startSession() {
        configSection.classList.add('hidden');
        problemContainer.classList.remove('hidden');
        gamificationHeader.classList.remove('hidden');
        updateGamificationUI();
        fetchProblem();
    }

    async function callGeminiWithRetry(prompt, schema, maxRetries = 2) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
                if (schema) {
                    payload.generationConfig = { responseMimeType: "application/json", responseSchema: schema };
                }
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${userApiKey}`;

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) throw new Error(`API Error: ${response.status}`);

                const result = await response.json();

                if (result.candidates?.[0]?.content?.parts?.[0]) {
                    return result.candidates[0].content.parts[0].text;
                }

                throw new Error("API response format is not valid.");

            } catch (error) {
                console.error(`Attempt ${attempt} failed:`, error);
                if (attempt === maxRetries) {
                    throw error;
                }
                await new Promise(res => setTimeout(res, 1000));
            }
        }
    }


    async function fetchProblem() {
        setLoading(true);
        resultArea.classList.add('hidden');
        state.isAnswered = false;

        const selectedLevel = levelSelect.value;
        const prompt = `Sei un esperto di didattica della matematica. Crea un problema a risposta multipla.
        - Argomento: ${topicSelect.value}
        - Anno: ${yearSelect.value}°
        - Livello di difficoltà: ${selectedLevel}
        - Requisiti: Il problema deve essere sfidante ma adeguato al livello. Le 4 opzioni devono essere plausibili. Usa LaTeX per ogni formula.
        - Output: JSON strutturato come da schema, senza markdown.`;

        try {
            const rawText = await callGeminiWithRetry(prompt, problemSchema);
            const jsonMatch = rawText.match(/{[\s\S]*}/);
            state.currentProblem = JSON.parse(jsonMatch[0]);
            renderProblem();
        } catch (error) {
            console.error("Error fetching problem after multiple retries:", error);
            problemText.innerHTML = `
                <p class="text-red-600 font-semibold">Oops, si è verificato un problema!</p>
                <p class="mt-2 text-gray-600">Non sono riuscito a creare un problema. La chiave API potrebbe essere errata o i server potrebbero essere sovraccarichi. Riprova cliccando su "Prossimo Problema".</p>
            `;
        } finally {
            setLoading(false);
        }
    }

    function renderWithLatex(element, text) {
         if (window.renderMathInElement) {
            element.innerHTML = text;
            window.renderMathInElement(element, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false}
                ]
            });
         } else {
            element.innerHTML = text;
         }
    }

    function renderProblem() {
        renderWithLatex(problemText, state.currentProblem.testo);
        optionsContainer.innerHTML = '';
        state.currentProblem.opzioni.forEach((optionText, index) => {
            const button = document.createElement('button');
            button.classList.add('option-btn', 'p-4', 'rounded-lg', 'text-left', 'w-full', 'font-semibold');
            button.dataset.index = index;
            renderWithLatex(button, optionText)
            button.addEventListener('click', handleAnswerSelection);
            optionsContainer.appendChild(button);
        });
    }

    function handleAnswerSelection(event) {
        if (state.isAnswered) return;
        state.isAnswered = true;

        const selectedButton = event.currentTarget;
        const selectedIndex = parseInt(selectedButton.dataset.index, 10);
        // FIX: Assicura che l'indice corretto sia sempre un numero intero per un confronto affidabile.
        const correctIndex = parseInt(state.currentProblem.risposta_corretta_index, 10);

        const isCorrect = selectedIndex === correctIndex;
        updateStats(isCorrect);

        Array.from(optionsContainer.children).forEach((btn, index) => {
            btn.disabled = true;
            if (index === correctIndex) {
                btn.classList.add('correct');
            } else if (index === selectedIndex) {
                btn.classList.add('incorrect');
            }
        });

        resultTitle.textContent = isCorrect ? "Corretto!" : "Non proprio...";
        resultTitle.className = isCorrect ? 'text-green-600' : 'text-red-600';
        renderWithLatex(explanationArea, state.currentProblem.spiegazione);
        resultArea.classList.remove('hidden');
    }

    function updateStats(isCorrect) {
        if (isCorrect) {
            state.score += 10;
            state.streak += 1;
        } else {
            state.streak = 0;
        }
        updateGamificationUI();
        checkAndAwardBadges();
    }

    function updateGamificationUI() {
        scoreEl.textContent = state.score;
        streakEl.textContent = `${state.streak} 🔥`;
        badgesContainer.innerHTML = '';
        for (const key in state.badges) {
            const badge = state.badges[key];
            const badgeEl = document.createElement('div');
            badgeEl.textContent = badge.icon;
            badgeEl.title = `${badge.name} (${badge.unlocked ? 'Sbloccato' : 'Bloccato'})`;
            badgeEl.classList.add('badge', 'text-2xl', 'transition-all', 'duration-500');
            if (badge.unlocked) {
                badgeEl.classList.add('unlocked');
            }
            badgesContainer.appendChild(badgeEl);
        }
    }

    function checkAndAwardBadges() {
        for (const key in state.badges) {
            const badge = state.badges[key];
            if (!badge.unlocked && badge.condition(state)) {
                badge.unlocked = true;
                showBadgeToast(badge);
                updateGamificationUI();
            }
        }
    }

    function showBadgeToast(badge) {
        toastIcon.textContent = badge.icon;
        toastText.textContent = `Hai ottenuto il badge: "${badge.name}"`;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    }

    function setLoading(isLoading) {
        loader.classList.toggle('hidden', !isLoading);
        problemContent.classList.toggle('hidden', isLoading);
    }

    // --- Inizializzazione ---
    handleTopicChange();
});
