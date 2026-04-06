import * as THREE from "three";

const DAY_LENGTH = 600; // 10 minutes per full cycle

export type TimePhase = "day" | "sunset" | "night" | "sunrise";

// Sky colors for each phase
const SKY_DAY = new THREE.Color(0x87ceeb);
const SKY_SUNSET = new THREE.Color(0xff6b35);
const SKY_NIGHT = new THREE.Color(0x0a0a2a);
const SKY_SUNRISE = new THREE.Color(0xff8c42);

/**
 * Manages the day/night cycle: time progression, sky color, and lighting.
 */
export class DayNightCycle {
  /** 0 = noon, 0.5 = midnight, wraps at 1.0 */
  public timeOfDay = 0;

  private readonly skyColor = new THREE.Color();

  update(dt: number): void {
    this.timeOfDay += dt / DAY_LENGTH;
    if (this.timeOfDay >= 1) this.timeOfDay -= 1;
  }

  getPhase(): TimePhase {
    const t = this.timeOfDay;
    if (t < 0.3 || t >= 0.8) return "day";
    if (t < 0.4) return "sunset";
    if (t < 0.7) return "night";
    return "sunrise";
  }

  isNight(): boolean {
    const t = this.timeOfDay;
    return t > 0.35 && t < 0.75;
  }

  getSkyColor(): THREE.Color {
    const t = this.timeOfDay;

    if (t < 0.3) {
      // Full day
      this.skyColor.copy(SKY_DAY);
    } else if (t < 0.4) {
      // Sunset transition (0.3 → 0.4)
      const f = (t - 0.3) / 0.1;
      this.skyColor.copy(SKY_DAY).lerp(SKY_SUNSET, f);
      if (f > 0.5) this.skyColor.lerp(SKY_NIGHT, (f - 0.5) * 2);
    } else if (t < 0.7) {
      // Full night
      this.skyColor.copy(SKY_NIGHT);
    } else if (t < 0.8) {
      // Sunrise transition (0.7 → 0.8)
      const f = (t - 0.7) / 0.1;
      this.skyColor.copy(SKY_NIGHT).lerp(SKY_SUNRISE, f);
      if (f > 0.5) this.skyColor.lerp(SKY_DAY, (f - 0.5) * 2);
    } else {
      // Day again
      this.skyColor.copy(SKY_DAY);
    }

    return this.skyColor;
  }

  getAmbientIntensity(): number {
    const t = this.timeOfDay;
    if (t < 0.3 || t >= 0.8) return 0.6;
    if (t < 0.4) return 0.6 - (t - 0.3) / 0.1 * 0.45; // 0.6 → 0.15
    if (t < 0.7) return 0.15;
    return 0.15 + (t - 0.7) / 0.1 * 0.45; // 0.15 → 0.6
  }

  getDirectionalIntensity(): number {
    const t = this.timeOfDay;
    if (t < 0.3 || t >= 0.8) return 0.8;
    if (t < 0.4) return 0.8 - (t - 0.3) / 0.1 * 0.7; // 0.8 → 0.1
    if (t < 0.7) return 0.1;
    return 0.1 + (t - 0.7) / 0.1 * 0.7; // 0.1 → 0.8
  }

  getSunPosition(): { x: number; y: number; z: number } {
    // Sun rotates around the world center
    const angle = this.timeOfDay * Math.PI * 2;
    return {
      x: Math.cos(angle) * 80,
      y: Math.sin(angle) * 80,
      z: 30,
    };
  }

  /** Display string for HUD */
  getTimeString(): string {
    // Convert timeOfDay to 24h clock (0 = noon = 12:00, 0.5 = midnight = 00:00)
    const hours = Math.floor(((this.timeOfDay + 0.5) % 1) * 24);
    const minutes = Math.floor((((this.timeOfDay + 0.5) % 1) * 24 - hours) * 60);
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }
}
