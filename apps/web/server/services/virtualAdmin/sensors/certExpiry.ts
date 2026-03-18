import tls from "node:tls";
import type { Sensor, SensorReading } from "../types";

const DOMAIN = "smartaihub.app";

const certExpirySensor: Sensor = {
  id: "cert_expiry",
  name: "TLS Certificate Expiry",
  defaultIntervalMs: 86_400_000,
  category: "system",

  async collect(): Promise<SensorReading> {
    try {
      const cert = await new Promise<tls.PeerCertificate>((resolve, reject) => {
        const socket = tls.connect(443, DOMAIN, { servername: DOMAIN }, () => {
          const peerCert = socket.getPeerCertificate();
          socket.destroy();
          if (!peerCert || !peerCert.valid_to) {
            reject(new Error("No certificate returned"));
          } else {
            resolve(peerCert);
          }
        });
        socket.setTimeout(10_000, () => {
          socket.destroy();
          reject(new Error("TLS connection timeout"));
        });
        socket.on("error", reject);
      });

      const expiresAt = new Date(cert.valid_to);
      const daysRemaining = Math.floor(
        (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );

      let status: SensorReading["status"] = "healthy";
      if (daysRemaining < 7) status = "critical";
      else if (daysRemaining < 30) status = "degraded";

      return {
        sensorId: "cert_expiry",
        timestamp: new Date(),
        status,
        metrics: {
          daysRemaining,
          expiresAt: expiresAt.toISOString(),
        },
        message: `Certificate expires in ${daysRemaining} days`,
      };
    } catch (err) {
      return {
        sensorId: "cert_expiry",
        timestamp: new Date(),
        status: "unknown",
        metrics: {},
        message: err instanceof Error ? err.message : "Cert check failed",
      };
    }
  },
};

export default certExpirySensor;
