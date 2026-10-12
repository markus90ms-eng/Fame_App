// Fame – iPhone-Neigung steuert die echte X-Drehung des 3D-Edelsteins.
// Nur auf der vorhandenen Startseite aktiv. Keine CSS-Verschiebung des Canvas,
// keine Aenderung an der Card und keine Beeintraechtigung der Fingerdrehung.

export function homeGemTilt(screen, diamond) {
  const vault = screen.querySelector('.welcome-vault');
  if (!vault || typeof diamond?.setTiltPitch !== 'function'
      || typeof window.DeviceOrientationEvent === 'undefined') return () => {};

  let disposed = false;
  let initialBeta = null;
  let permissionButton = null;

  const onOrientation = (event) => {
    const beta = event.beta;
    if (disposed || document.hidden || !Number.isFinite(beta)) return;

    // Wenn gueltige Sensordaten eintreffen, ist die Freigabe aktiv.
    if (permissionButton) {
      permissionButton.remove();
      permissionButton = null;
    }

    // Anfangslage kalibrieren: das Edelsteinbild springt beim Start nicht.
    if (initialBeta === null) {
      initialBeta = beta;
      diamond.setTiltPitch(0);
      return;
    }

    // Der Beta-Winkel beschreibt Vor-/Zurueckneigen des iPhones.
    // Wrap-around beim Uebergang zwischen -180 und +180 Grad beachten.
    let degrees = beta - initialBeta;
    if (degrees > 180) degrees -= 360;
    else if (degrees < -180) degrees += 360;

    // Groessere Ruhezone: kleine unbewusste Handbewegungen lassen den Stein still.
    const deadZone = 2;
    const adjusted = Math.abs(degrees) <= deadZone
      ? 0 : degrees - Math.sign(degrees) * deadZone;

    // Halbe Empfindlichkeit gegenueber V92: 40 Grad Handybewegung
    // ergeben etwa 46 Grad echte Steindrehung statt fast 90 Grad.
    // Auch die Ober-/Unterseite bleibt bei groesserer Neigung erreichbar.
    const pitch = Math.max(-1.48, Math.min(1.48, adjusted * 0.022));
    diamond.setTiltPitch(pitch);
  };

  const onVisibility = () => {
    if (document.hidden) {
      initialBeta = null;
      diamond.setTiltPitch(0);
    }
  };

  window.addEventListener('deviceorientation', onOrientation, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  // iOS erfordert eine ausdrueckliche Freigabe nach einem echten Fingertipp.
  if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'home-gem-tilt-permission';
    btn.textContent = '3D-Neigung aktivieren';
    btn.setAttribute('aria-label', '3D-Neigung des Edelsteins per Bewegungssensor aktivieren');
    btn.title = 'Erlaubt, den Edelstein durch Neigen von oben und unten zu sehen';

    // Vorhandene globalen Bewegungseffekte sollen keinen zweiten iOS-Prompt ausloesen.
    btn.addEventListener('pointerup', (event) => event.stopPropagation());
    btn.addEventListener('click', () => {
      let permission;
      try {
        // Direkt innerhalb des Klick-Handlers fuer die iOS-Gesture-Permission.
        permission = window.DeviceOrientationEvent.requestPermission();
      } catch {
        if (!disposed) btn.textContent = 'Sensor nicht verfügbar';
        return;
      }
      Promise.resolve(permission).then((result) => {
        if (disposed || permissionButton !== btn) return;
        if (result === 'granted') {
          // Nach der Freigabe wartet die App auf Sensordaten zur Kalibrierung.
          btn.remove();
          permissionButton = null;
        } else {
          btn.textContent = 'Sensor freigeben';
          btn.title = 'Bitte die Bewegungserkennung in Safari erlauben';
        }
      }).catch(() => {
        if (!disposed && permissionButton === btn) {
          btn.textContent = 'Sensor freigeben';
          btn.title = 'Bitte die Bewegungserkennung in Safari erlauben';
        }
      });
    });
    permissionButton = btn;
    vault.appendChild(btn);
  }

  return () => {
    disposed = true;
    window.removeEventListener('deviceorientation', onOrientation);
    document.removeEventListener('visibilitychange', onVisibility);
    diamond.setTiltPitch(0);
    permissionButton?.remove();
  };
}
