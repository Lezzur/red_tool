


export default function HowItWorks() {
    const steps = [
        {
            title: "1. Editing",
            description: "AI generates responsibilities. Team nominates additions. Owner cleans and assigns weights.",
            icon: "/icons/editing-icon.svg",
            color: "var(--mode-editing)",
            bg: "var(--mode-editing-bg)",
            delay: "0ms"
        },
        {
            title: "2. Acquiring",
            description: "Participants independently select responsibilities. Blind selection ensures fairness.",
            icon: "/icons/acquiring-icon.svg",
            color: "var(--mode-acquiring)",
            bg: "var(--mode-acquiring-bg)",
            delay: "100ms"
        },
        {
            title: "3. Evaluating",
            description: "Owner resolves conflicts, adds factors, and the AI calculates fair equity splits.",
            icon: "/icons/evaluating-icon.svg",
            color: "var(--mode-evaluating)",
            bg: "var(--mode-evaluating-bg)",
            delay: "200ms"
        }
    ];

    return (
        <section style={{
            marginTop: 'var(--space-3xl)',
            marginBottom: 'var(--space-3xl)',
            position: 'relative'
        }}>
            {/* Decorative Background Elements */}
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '120%',
                height: '100%',
                background: 'radial-gradient(circle at center, var(--bg-glass) 0%, transparent 70%)',
                zIndex: -1,
                pointerEvents: 'none'
            }} />

            <div style={{ textAlign: 'center', marginBottom: 'var(--space-2xl)' }}>
                <h3 className="section-title" style={{
                    fontSize: 'var(--font-2xl)',
                    marginBottom: 'var(--space-sm)',
                    background: 'var(--accent-gradient)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    display: 'inline-block'
                }}>
                    How It Works
                </h3>
                <p className="section-subtitle" style={{ maxWidth: 600, margin: '0 auto', fontSize: 'var(--font-md)' }}>
                    Fairness shouldn't be complicated. Here is our 3-step process.
                </p>
            </div>

            <div className="grid-3">
                {steps.map((step, index) => (
                    <div
                        key={index}
                        className="card"
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            textAlign: 'center',
                            padding: 'var(--space-xl)',
                            height: '100%',
                            position: 'relative',
                            overflow: 'hidden',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            border: `1px solid ${step.bg}`,
                            animation: 'fadeInUp 0.6s ease-out forwards',
                            animationDelay: step.delay
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-8px)';
                            e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                            e.currentTarget.style.borderColor = step.color;
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                            e.currentTarget.style.borderColor = step.bg;
                        }}
                    >
                        {/* Background Gradient Blob */}
                        <div style={{
                            position: 'absolute',
                            top: '-60px',
                            right: '-60px',
                            width: '180px',
                            height: '180px',
                            background: step.bg,
                            borderRadius: '50%',
                            filter: 'blur(50px)',
                            opacity: 0.6,
                            zIndex: 0
                        }} />



                        <h4 style={{
                            fontSize: 'var(--font-xl)',
                            fontWeight: 700,
                            marginBottom: 'var(--space-sm)',
                            color: 'var(--text-primary)',
                            zIndex: 1
                        }}>
                            {step.title}
                        </h4>

                        <p style={{
                            fontSize: 'var(--font-base)',
                            color: 'var(--text-secondary)',
                            lineHeight: 1.6,
                            zIndex: 1
                        }}>
                            {step.description}
                        </p>
                    </div>
                ))}
            </div>

            <style jsx global>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
        </section>
    );
}
