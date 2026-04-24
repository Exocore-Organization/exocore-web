import React, { useMemo } from 'react';
import systemData from '../system.json';
import { getTemplateIcon, TEMPLATE_CATEGORIES } from '../shared/components/IconTemplate';

export interface CreateForm {
    name: string;
    description: string;
    language: string;
}

interface Template {
    id: string;
    meta: { name: string; description: string; language: string; category?: string; icon?: string };
}

interface LangInfo {
    icon: string;
    label: string;
}

const LANG_DESCRIPTIONS: Record<string, string> = {
    nodejs: 'JavaScript runtime for server-side apps, APIs, and automation.',
    python: 'Great for scripting, data science, bots, and backends.',
    html: 'Build and preview websites with vanilla HTML, CSS & JS.',
    php: 'Classic server-side scripting for web applications.',
};

// Languages the editor / runtime currently support end-to-end.
// Anything not listed here is rendered with a 🔒 badge and is not
// selectable. Re-enable a language by adding its `system.json` id below
// once the matching template + runtime support are wired in.
const ENABLED_LANGUAGES = new Set<string>(['nodejs', 'python']);

const TOTAL_STEPS = 4;

interface CreateProjectWizardProps {
    createStep: number;
    isCreating: boolean;
    createForm: CreateForm;
    useTemplate: boolean;
    selectedTemplateId: string;
    selectedCategory: string;
    availableTemplates: Template[];
    selectedLang: LangInfo;
    authorName: string;
    onClose: () => void;
    onNext: () => void;
    onBack: () => void;
    onFormChange: (updates: Partial<CreateForm>) => void;
    onUseTemplateChange: (v: boolean) => void;
    onTemplateSelect: (id: string) => void;
    onCategorySelect: (id: string) => void;
    onLangChange: (langId: string) => void;
    onSubmit: () => void;
}

export const CreateProjectWizard: React.FC<CreateProjectWizardProps> = ({
    createStep, isCreating, createForm, useTemplate, selectedTemplateId, selectedCategory,
    availableTemplates, selectedLang, authorName,
    onClose, onNext, onBack, onFormChange, onUseTemplateChange,
    onTemplateSelect, onCategorySelect, onLangChange, onSubmit,
}) => {
    const hasTemplates = availableTemplates.length > 0;

    // Hard filter: only show templates whose runtime language is enabled.
    // This complements the language-card lock and keeps the user from
    // selecting a PHP/HTML/etc template via the category route.
    const enabledTemplates = useMemo(
        () => availableTemplates.filter(t => ENABLED_LANGUAGES.has(t.meta.language)),
        [availableTemplates],
    );

    const templatesByCategory = useMemo(() => {
        const map: Record<string, Template[]> = {};
        for (const t of enabledTemplates) {
            const cat = t.meta.category || 'language';
            if (!map[cat]) map[cat] = [];
            map[cat].push(t);
        }
        return map;
    }, [enabledTemplates]);

    const visibleTemplates = selectedCategory ? templatesByCategory[selectedCategory] || [] : [];
    const activeCatMeta = TEMPLATE_CATEGORIES.find(c => c.id === selectedCategory);

    return (
    <div className="modal-backdrop" style={{ zIndex: 11000 }} onClick={onClose}>
    <div className="modal-box wizard-box" onClick={e => e.stopPropagation()}>

    <div className="modal-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '1rem' }}>
    <span className="modal-title">✨ New Project</span>
    <div className="wizard-steps">
    {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(s => (
        <div
        key={s}
        className={`wizard-step-dot ${createStep === s ? 'active' : createStep > s ? 'done' : ''}`}
        title={s === 1 ? 'Name' : s === 2 ? 'Category' : s === 3 ? 'Template' : 'Confirm'}
        />
    ))}
    </div>
    </div>

    {createStep === 1 && (
        <div className="wizard-content">
        <div className="wizard-step-label">Step 1 of {TOTAL_STEPS} — Name your project</div>
        <p className="wizard-hint">Choose a unique name. This becomes your project directory.</p>
        <div className="wizard-field-group">
        <label className="create-label">Project Name <span style={{ color: '#ff5555' }}>*</span></label>
        <input
        className="dialog-field notranslate"
        translate="no"
        value={createForm.name}
        onChange={e => onFormChange({ name: e.target.value })}
        placeholder="my-awesome-project"
        autoFocus
        onKeyDown={e => e.key === 'Enter' && onNext()}
        />
        </div>
        <div className="wizard-field-group">
        <label className="create-label">Description <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, opacity: 0.5 }}>(optional)</span></label>
        <textarea
        className="dialog-field"
        value={createForm.description}
        onChange={e => onFormChange({ description: e.target.value })}
        placeholder="What does this project do?"
        rows={2}
        style={{ resize: 'none', minHeight: 'unset' }}
        />
        </div>
        </div>
    )}

    {createStep === 2 && (
        <div className="wizard-content">
        {hasTemplates ? (
            <>
            <div className="wizard-step-label">Step 2 of {TOTAL_STEPS} — Pick a category</div>
            <p className="wizard-hint">What kind of project do you want to build?</p>
            <div className="wizard-cat-grid">
            {TEMPLATE_CATEGORIES.map(cat => {
                const count = templatesByCategory[cat.id]?.length || 0;
                return (
                    <button
                    key={cat.id}
                    className={`wizard-cat-card ${selectedCategory === cat.id ? 'selected' : ''}`}
                    onClick={() => onCategorySelect(cat.id)}
                    disabled={count === 0}
                    >
                    <div className="wizard-cat-icon" style={{ color: cat.color }}>{cat.icon}</div>
                    <div className="wizard-cat-text">
                        <div className="wizard-cat-label">{cat.label}</div>
                        <div className="wizard-cat-desc">{cat.description}</div>
                    </div>
                    <div className="wizard-cat-count">{count}</div>
                    </button>
                );
            })}
            </div>
            </>
        ) : (
            <>
            <div className="wizard-step-label">Step 2 of {TOTAL_STEPS} — Choose your environment</div>
            <p className="wizard-hint">
                Pick a language for your project. Locked languages are
                coming soon — Node.js and Python are fully supported today.
            </p>
            <div className="wizard-lang-grid">
            {systemData.languages.map(l => {
                const isEnabled = ENABLED_LANGUAGES.has(l.id);
                const isSelected = !useTemplate && createForm.language === l.id;
                return (
                    <button
                    key={l.id}
                    className={`wizard-lang-card ${isSelected ? 'selected' : ''} ${isEnabled ? '' : 'locked'}`}
                    onClick={() => {
                        if (!isEnabled) return;
                        onUseTemplateChange(false);
                        onLangChange(l.id);
                    }}
                    disabled={!isEnabled}
                    title={isEnabled ? l.label : `${l.label} support is coming soon`}
                    aria-disabled={!isEnabled}
                    style={
                        isEnabled
                            ? undefined
                            : { opacity: 0.55, cursor: 'not-allowed', position: 'relative' }
                    }
                    >
                    <div className="wizard-lang-icon" style={{ position: 'relative' }}>
                        {l.icon}
                        {!isEnabled && (
                            <span
                                aria-hidden
                                style={{
                                    position: 'absolute', top: -6, right: -10,
                                    fontSize: 14, lineHeight: 1,
                                    background: 'rgba(15, 16, 22, 0.85)',
                                    border: '1px solid rgba(255,255,255,0.18)',
                                    borderRadius: 999, padding: '2px 4px',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                                }}
                            >🔒</span>
                        )}
                    </div>
                    <div className="wizard-lang-name">
                        {l.label}
                        {!isEnabled && (
                            <span
                                style={{
                                    marginLeft: 6, fontSize: 10, fontWeight: 600,
                                    letterSpacing: '0.06em', textTransform: 'uppercase',
                                    color: '#fbbf24',
                                    background: 'rgba(251,191,36,0.12)',
                                    border: '1px solid rgba(251,191,36,0.35)',
                                    borderRadius: 999, padding: '2px 7px',
                                }}
                            >Soon</span>
                        )}
                    </div>
                    <div className="wizard-lang-desc">
                        {isEnabled
                            ? (LANG_DESCRIPTIONS[l.id] || '')
                            : `${l.label} runtime + templates aren’t wired up yet — coming soon.`}
                    </div>
                    </button>
                );
            })}
            </div>
            </>
        )}
        </div>
    )}

    {createStep === 3 && (
        <div className="wizard-content">
        <div className="wizard-step-label">
            Step 3 of {TOTAL_STEPS} — {activeCatMeta?.label || 'Choose'} template
        </div>
        <p className="wizard-hint">{visibleTemplates.length} template{visibleTemplates.length === 1 ? '' : 's'} available. Pick one to continue.</p>
        <div className="wizard-lang-grid">
        {visibleTemplates.map(t => (
            <button
            key={t.id}
            className={`wizard-lang-card ${useTemplate && selectedTemplateId === t.id ? 'selected' : ''}`}
            onClick={() => { onUseTemplateChange(true); onTemplateSelect(t.id); }}
            >
            <div className="wizard-lang-icon">
                {getTemplateIcon(t.meta.icon, t.meta.language, 22)}
            </div>
            <div className="wizard-lang-name">{t.meta.name}</div>
            <div className="wizard-lang-desc">{t.meta.description}</div>
            </button>
        ))}
        </div>
        </div>
    )}

    {createStep === 4 && (
        <div className="wizard-content">
        <div className="wizard-step-label">Step 4 of {TOTAL_STEPS} — Review & Create</div>
        <p className="wizard-hint">Everything look good? Hit create to launch your project.</p>
        <div className="wizard-summary">
        <div className="wizard-summary-row">
        <span className="wizard-summary-key">Name</span>
        <span className="wizard-summary-val notranslate" translate="no">{createForm.name.trim()}</span>
        </div>
        {createForm.description.trim() && (
            <div className="wizard-summary-row">
            <span className="wizard-summary-key">Description</span>
            <span className="wizard-summary-val">{createForm.description.trim()}</span>
            </div>
        )}
        {hasTemplates && activeCatMeta && (
            <div className="wizard-summary-row">
            <span className="wizard-summary-key">Category</span>
            <span className="wizard-summary-val">{activeCatMeta.label}</span>
            </div>
        )}
        <div className="wizard-summary-row">
        <span className="wizard-summary-key">Template</span>
        <span className="wizard-summary-val">
            {useTemplate
                ? (availableTemplates.find(t => t.id === selectedTemplateId)?.meta.name || selectedTemplateId)
                : `${selectedLang.icon} ${selectedLang.label}`}
        </span>
        </div>
        <div className="wizard-summary-row">
        <span className="wizard-summary-key">Author</span>
        <span className="wizard-summary-val">{authorName}</span>
        </div>
        </div>
        <p className="wizard-hint" style={{ marginTop: '0.75rem', color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem' }}>
        After creating, the editor opens immediately and the install runs in the project's terminal.
        </p>
        </div>
    )}

    <div className="modal-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} onClick={e => e.stopPropagation()}>
    {createStep > 1 ? (
        <button className="btn btn-secondary btn-sm wizard-back-btn" onClick={e => { e.stopPropagation(); onBack(); }} disabled={isCreating}>
        ← Back
        </button>
    ) : (
        <button className="btn btn-secondary btn-sm wizard-back-btn" onClick={e => { e.stopPropagation(); onClose(); }} disabled={isCreating}>
        Cancel
        </button>
    )}

    {createStep < TOTAL_STEPS ? (
        <button className="btn btn-primary btn-sm wizard-next-btn" onClick={e => { e.stopPropagation(); onNext(); }}>
        Next →
        </button>
    ) : (
        <button
        className="btn btn-primary btn-sm wizard-create-btn"
        onClick={e => { e.stopPropagation(); onSubmit(); }}
        disabled={isCreating}
        >
        {isCreating ? '⚙ Creating…' : '🚀 Create'}
        </button>
    )}
    </div>

    </div>

    <style>{`
        .wizard-box {
            max-width: 520px;
            width: 95%;
            max-height: min(88vh, 720px);
            display: flex;
            flex-direction: column;
            gap: 0;
            overflow: hidden;
        }
        .wizard-steps { display: flex; gap: 6px; align-items: center; }
        .wizard-step-dot {
            width: 8px; height: 8px; border-radius: 50%;
            background: rgba(255,255,255,0.15); transition: all 0.2s;
        }
        .wizard-step-dot.active { background: var(--indigo-light, #818cf8); width: 20px; border-radius: 4px; }
        .wizard-step-dot.done { background: rgba(16,185,129,0.8); }
        .wizard-content {
            padding: 1.25rem 1.5rem;
            display: flex; flex-direction: column; gap: 0.75rem;
            flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
        }
        .wizard-step-label { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.45; }
        .wizard-hint { font-size: 0.82rem; opacity: 0.6; margin: 0; line-height: 1.5; }
        .wizard-field-group { display: flex; flex-direction: column; gap: 0.4rem; }

        .wizard-cat-grid { display: flex; flex-direction: column; gap: 0.5rem; }
        .wizard-cat-card {
            display: flex; align-items: center; gap: 0.85rem;
            background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
            border-radius: 10px; padding: 0.85rem 1rem; cursor: pointer; text-align: left;
            transition: all 0.15s; color: inherit; width: 100%;
        }
        .wizard-cat-card:hover:not(:disabled) {
            background: rgba(255,255,255,0.06);
            border-color: rgba(255,229,0,0.4);
            transform: translateX(2px);
        }
        .wizard-cat-card.selected {
            background: rgba(255,229,0,0.10);
            border-color: rgba(255,229,0,0.55);
        }
        .wizard-cat-card:disabled { opacity: 0.35; cursor: not-allowed; }
        .wizard-cat-icon {
            font-size: 1.6rem; line-height: 1; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center;
            width: 40px; height: 40px;
            background: rgba(255,255,255,0.04);
            border-radius: 8px;
        }
        .wizard-cat-text { flex: 1; min-width: 0; }
        .wizard-cat-label { font-size: 0.9rem; font-weight: 700; }
        .wizard-cat-desc { font-size: 0.72rem; opacity: 0.5; margin-top: 2px; }
        .wizard-cat-count {
            font-size: 0.7rem; font-weight: 700;
            background: rgba(255,229,0,0.15); color: #FFE500;
            padding: 3px 8px; border-radius: 999px; flex-shrink: 0;
        }

        .wizard-lang-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
        .wizard-lang-card {
            background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
            border-radius: 8px; padding: 0.75rem; cursor: pointer; text-align: left;
            transition: all 0.15s; display: flex; flex-direction: column; gap: 4px; color: inherit;
        }
        .wizard-lang-card:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.15); }
        .wizard-lang-card.selected { background: rgba(255,229,0,0.10); border-color: rgba(255,229,0,0.5); }
        .wizard-lang-icon {
            font-size: 1.4rem; line-height: 1;
            display: flex; align-items: center;
            height: 26px;
        }
        .wizard-lang-name { font-size: 0.82rem; font-weight: 700; margin-top: 2px; }
        .wizard-lang-desc { font-size: 0.7rem; opacity: 0.5; line-height: 1.4; }

        .wizard-summary {
            background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
            border-radius: 8px; overflow: hidden;
        }
        .wizard-summary-row {
            display: flex; align-items: flex-start; gap: 1rem;
            padding: 0.65rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.82rem;
        }
        .wizard-summary-row:last-child { border-bottom: none; }
        .wizard-summary-key {
            width: 90px; flex-shrink: 0; opacity: 0.4; font-size: 0.75rem;
            font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; padding-top: 1px;
        }
        .wizard-summary-val { font-weight: 500; word-break: break-all; }
        .wizard-box .modal-footer {
            flex-shrink: 0;
            margin-top: 0;
            display: flex;
            gap: 0.5rem;
            padding: 0.75rem 1rem;
            flex-wrap: nowrap;
        }
        .wizard-box .modal-footer .btn { flex-shrink: 0; }
        .wizard-back-btn,
        .wizard-next-btn,
        .wizard-create-btn {
            width: auto;
            padding: 0.55rem 1.1rem;
            white-space: nowrap;
            flex: 1 1 0;
            min-width: 0;
            max-width: 50%;
        }
        @media (max-width: 480px) {
            .wizard-back-btn,
            .wizard-next-btn,
            .wizard-create-btn {
                font-size: 0.78rem;
                padding: 0.55rem 0.9rem;
            }
        }
    `}</style>
    </div>
    );
};
