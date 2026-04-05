/**
 * Immutable 3D vector. All arithmetic methods return new instances.
 * No Three.js dependency — safe for Web Workers.
 */
export class Vector3 {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number
  ) {}

  /** Component-wise addition. */
  add(v: Vector3): Vector3 {
    return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  /** Component-wise subtraction. */
  sub(v: Vector3): Vector3 {
    return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  /** Uniform scalar multiplication. */
  scale(s: number): Vector3 {
    return new Vector3(this.x * s, this.y * s, this.z * s);
  }

  /** Euclidean length. */
  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  /** Unit vector in the same direction, or {@link Vector3.ZERO} if length is 0. */
  normalize(): Vector3 {
    const len = this.length();
    if (len === 0) return Vector3.ZERO;
    return this.scale(1 / len);
  }

  /** Dot product. */
  dot(v: Vector3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  /** Cross product. */
  cross(v: Vector3): Vector3 {
    return new Vector3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x
    );
  }

  /** Euclidean distance to another vector. */
  distanceTo(v: Vector3): number {
    return this.sub(v).length();
  }

  /** Component-wise equality check. */
  equals(v: Vector3): boolean {
    return this.x === v.x && this.y === v.y && this.z === v.z;
  }

  /** Returns `[x, y, z]` tuple. */
  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  /** The zero vector (0, 0, 0). */
  static readonly ZERO = new Vector3(0, 0, 0);

  /** The up vector (0, 1, 0). */
  static readonly UP = new Vector3(0, 1, 0);
}
