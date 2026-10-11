export function HowItWorksRoute() {
  return (
    <article className="card prose">
      <h2>How this works</h2>
      <p>
        Weather apps give one &ldquo;feels like&rdquo; number for an imaginary person. Weather
        Report gives <em>your</em> number: it applies live weather to the clothes you&rsquo;re
        wearing using a heat-balance model of the human body.
      </p>
      <h3>What &ldquo;You&rsquo;ll feel 14°C&rdquo; means</h3>
      <p>
        You&rsquo;ll feel the way a person in a T-shirt, jeans, socks and sneakers feels at 14°C,
        standing in the shade on a still day with 50% humidity. That reference person is the
        yardstick. Someone in a full winter kit at −15°C can genuinely feel 22°C.
      </p>
      <h3>What goes into the number</h3>
      <ul>
        <li>Air temperature, humidity and wind at body height</li>
        <li>Sun: direct and diffuse sunlight, snow glare, and whether you&rsquo;re in the shade</li>
        <li>Rain and snow soaking unprotected clothing</li>
        <li>
          Each garment&rsquo;s insulation, coverage, breathability, windproofing and waterproofing
        </li>
        <li>How active you are, and your &ldquo;I run cold / hot&rdquo; setting</li>
      </ul>
      <h3>Two numbers</h3>
      <p>
        <strong>Forecast feels-like</strong> is the official index: Environment and Climate Change
        Canada&rsquo;s wind chill when it&rsquo;s 0°C or below, humidex when it&rsquo;s warm and
        humid, otherwise the air temperature. <strong>You&rsquo;ll feel</strong> is ours.
      </p>
      <h3>Limits</h3>
      <ul>
        <li>
          An average adult. Your &ldquo;I run cold / hot&rdquo; setting is the only personal
          adjustment.
        </li>
        <li>
          Steady state, roughly 30 to 60 minutes outdoors. It doesn&rsquo;t model warming up or
          cooling down over time.
        </li>
        <li>Wetness is simplified: no drying over time.</li>
        <li>Outdoors only.</li>
      </ul>
      <p>
        Comfort estimates for everyday decisions, not medical or safety advice. In dangerous heat or
        cold, follow official guidance.
      </p>
      <p>
        The model follows ISO 7730, ISO 9920, ASHRAE 55 (SolarCal) and ASHRAE Fundamentals, and is
        tested against a reference implementation. Weather data by Open-Meteo.com (CC BY 4.0).
      </p>
    </article>
  );
}
