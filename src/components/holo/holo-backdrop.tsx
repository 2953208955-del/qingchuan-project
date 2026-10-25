type Particle = {
  left: string
  top: string
  size: number
  delay: string
  duration: string
  opacity: number
  tone?: 'blue' | 'gold'
}

const PARTICLES = [
  { left: '6%', top: '22%', size: 2, delay: '0s', duration: '18s', opacity: 0.5 },
  { left: '14%', top: '68%', size: 3, delay: '2.2s', duration: '22s', opacity: 0.4 },
  { left: '22%', top: '35%', size: 1.5, delay: '4.4s', duration: '16s', opacity: 0.6, tone: 'blue' },
  { left: '30%', top: '82%', size: 2, delay: '1.1s', duration: '20s', opacity: 0.35 },
  { left: '37%', top: '14%', size: 2.5, delay: '5.8s', duration: '24s', opacity: 0.45, tone: 'gold' },
  { left: '44%', top: '57%', size: 1.5, delay: '3.4s', duration: '17s', opacity: 0.55 },
  { left: '51%', top: '28%', size: 2, delay: '6.6s', duration: '21s', opacity: 0.35, tone: 'blue' },
  { left: '59%', top: '74%', size: 2.5, delay: '0.8s', duration: '19s', opacity: 0.45 },
  { left: '66%', top: '42%', size: 1.5, delay: '4.1s', duration: '23s', opacity: 0.5 },
  { left: '73%', top: '19%', size: 2, delay: '2.7s', duration: '18s', opacity: 0.4, tone: 'gold' },
  { left: '80%', top: '61%', size: 3, delay: '6.2s', duration: '25s', opacity: 0.3 },
  { left: '88%', top: '33%', size: 2, delay: '1.5s', duration: '20s', opacity: 0.55 },
  { left: '92%', top: '78%', size: 1.5, delay: '3.9s', duration: '17s', opacity: 0.35, tone: 'blue' },
  { left: '10%', top: '47%', size: 1.5, delay: '5.4s', duration: '22s', opacity: 0.4 },
  { left: '27%', top: '51%', size: 2.5, delay: '7.1s', duration: '24s', opacity: 0.3 },
  { left: '63%', top: '88%', size: 1.5, delay: '0.4s', duration: '16s', opacity: 0.5, tone: 'gold' },
  { left: '84%', top: '8%', size: 2, delay: '4.8s', duration: '21s', opacity: 0.4 },
  { left: '47%', top: '93%', size: 2, delay: '2.9s', duration: '19s', opacity: 0.35 },
] satisfies Particle[]

export function HoloBackdrop() {
  return (
    <div className="holo-backdrop" aria-hidden="true">
      <div className="holo-backdrop__glow holo-backdrop__glow--cyan" />
      <div className="holo-backdrop__glow holo-backdrop__glow--gold" />

      <div className="holo-backdrop__ripples">
        <svg
          className="holo-backdrop__ripple holo-backdrop__ripple--outer"
          viewBox="0 0 1200 1200"
          focusable="false"
        >
          <circle cx="600" cy="600" r="420" />
          <circle cx="600" cy="600" r="500" />
          <circle cx="600" cy="600" r="580" />
        </svg>
        <svg
          className="holo-backdrop__ripple holo-backdrop__ripple--inner"
          viewBox="0 0 1200 1200"
          focusable="false"
        >
          <circle cx="600" cy="600" r="180" />
          <circle cx="600" cy="600" r="260" />
          <circle cx="600" cy="600" r="340" />
        </svg>
      </div>

      <div className="holo-backdrop__particles">
        {PARTICLES.map((particle) => (
          <span
            key={`${particle.left}-${particle.top}`}
            className={`holo-backdrop__particle${
              particle.tone ? ` holo-backdrop__particle--${particle.tone}` : ''
            }`}
            style={{
              left: particle.left,
              top: particle.top,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              opacity: particle.opacity,
              animationDelay: particle.delay,
              animationDuration: particle.duration,
            }}
          />
        ))}
      </div>

      <div className="holo-backdrop__scanlines" />
      <div className="holo-backdrop__sweep" />
      <div className="holo-backdrop__grid" />
      <div className="holo-backdrop__vignette" />
    </div>
  )
}
