// Fame – sanftes Hoch-/Runterschweben des 3D-Edelsteins auf der Startseite.
// Bewusst nur auf der vorhandenen .welcome-vault-Buehne: keine Card- oder Theme-Aenderung.
// Der Edelstein-Renderer kann sich weiterhin wie bisher drehen und anklicken lassen.

export function homeGemTilt(screen) {
  const vault = screen.querySelector('.welcome-vault');
  const stage = vault?.querySelector('.stage3d');
  if (!vault || !stage || typeof window.DeviceOrientationEvent === 'undefined') return () => {};

  let disposed = false;
  let firstBeta = null;
  let targetY = 0;
  let currentY = 0;
  let animationFrame = 0;
  let permissionButton = null;

  // Traege, natuerliche Bewegung statt Spruengen bei kleinen Sensor-Schwankungen.
  const animate = () => {
    animationFrame = 0;
    if (disposed) return;
    currentY += (targetY - currentY) * 0.14;
    if (Math.abs(targetY - currentY) < 0.06) currentY = targetY;
    vault.style.setProperty('--home-gem-shift-y', currentY.toFixed(2) + 'px');
    if (Math.abs(targetY - currentY) >= 0.06) {
      animationFrame = requestAnimationFrame(animate);
    }
  };
  const schedule = () => {
    if (!animationFrame && !disposed) animationFrame = requestAnimationFrame(animate);
  };

  const onOrientation = (event) => {
    const beta = event.beta;
    if (disposed || document.hidden || !Number.isFinite(beta)) return;

    // Wenn bereits Sensordaten kommen, ist die Berechtigung vorhanden.
    if (permissionButton) {
      permissionButton.remove();
      permissionButton = null;
    }

    // Kalibrieren auf die aktuelle Handhaltung, ohne anfangs zu springen.
    if (firstBeta === null) {
      firstBeta = beta;
      return;
    }

    let angle = beta - firstBeta;
    if (angle > 180) angle -= 360;
    else if (angle < -180) angle += 360;

    // 1,5 Grad Totzone: verhindert nervoeses Zittern.
    const deadZone = 1.5;
    const delta = Math.abs(angle) <= deadZone ? 0 : angle - Math.sign(angle) * deadZone;
    // Sichtbar, aber innerhalb des vorhandenen Rahmens: maximal 20 Pixel.
    targetY = Math.max(-20, Math.min(20, delta * 0.62));
    schedule();
  };

  const resetOnVisibility = () => {
    if (document.hidden) {
      firstBeta = null;
      targetY = 0;
      schedule();
    }
  };

  window.addEventListener('deviceorientation', onOrientation, { passive: true });
  document.addEventListener('visibilitychange', resetOnVisibility);

  // iOS verlangt fuer DeviceOrientationEvent.requestPermission() eine echte Benutzeraktion.
  // Kleine Schaltflaeche in der Edelstein-Buehne; keine Verschiebung des App-Layouts.
  const permissionApi = window.DeviceOrientationEvent.requestPermission;
  if (typeof permissionApi === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'home-gem-tilt-permission';
    btn.textContent = '↕ Neigung aktivieren';
    btn.setAttribute('aria-label', 'Bewegungssensor fuer den Edelstein aktivieren');
    btn.title = 'Einmal antippen und die Bewegung des iPhones erlauben';
    // Der alte Gold/Glas-Neigungseffekt kann ebenfalls einen pointerup-Handler besitzen.
    // Diese Aktion hier loest die Berechtigungsabfrage nur einmal aus.
    btn.addEventListener('pointerup', (event) => event.stopPropagation());
    btn.addEventListener('click', () => {
      // Wichtig: innerhalb des Klick-Handlers, noch vor einem await.
      let permission;
      try {
        permission = window.DeviceOrientationEvent.requestPermission();
      } catch {
        if (!disposed) btn.textContent = 'Bewegung nicht verfügbar';
        return;
      }
      Promise.resolve(permission).then((result) => {
        if (disposed || permissionButton !== btn) return;
        if (result === 'granted') {
          btn.remove();
          permissionButton = null;
        } else {
          btn.textContent = 'Bewegung erlauben';
          btn.title = 'Bitte Bewegungssensor in Safari erlauben';
        }
      }).catch(() => {
        if (!disposed && permissionButton === btn) {
          btn.textContent = 'Bewegung erlauben';
          btn.title = 'Bitte Bewegungssensor in Safari erlauben';
        }
      });
    });
    permissionButton = btn;
    vault.appendChild(btn);
  }

  return () => {
    disposed = true;
    window.removeEventListener('deviceorientation', onOrientation);
    document.removeEventListener('visibilitychange', resetOnVisibility);
    if (animationFrame) cancelAnimationFrame(animationFrame);
    vault.style.removeProperty('--home-gem-shift-y');
    permissionButton?.remove();
  };
}
