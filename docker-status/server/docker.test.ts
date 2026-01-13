import { describe, expect, it, vi, beforeEach } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";

// Mock child_process
vi.mock("child_process", () => ({
  exec: vi.fn(),
}));

// Import after mocking
import {
  listContainers,
  getContainerStats,
  getContainerLogs,
  startContainer,
  stopContainer,
  restartContainer,
  getDockerInfo,
} from "./docker";

const execMock = exec as unknown as ReturnType<typeof vi.fn>;

// Helper to create mock exec response
function mockExecSuccess(stdout: string, stderr: string = "") {
  execMock.mockImplementation((cmd: string, callback: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
    callback(null, { stdout, stderr });
  });
}

function mockExecError(error: Error) {
  execMock.mockImplementation((cmd: string, callback: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
    callback(error, { stdout: "", stderr: "" });
  });
}

describe("Docker API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getDockerInfo", () => {
    it("returns Docker version and container counts", async () => {
      // Mock version call
      execMock.mockImplementationOnce((cmd: string, callback: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
        callback(null, { stdout: "24.0.7\n", stderr: "" });
      });
      // Mock info call
      execMock.mockImplementationOnce((cmd: string, callback: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
        callback(null, { stdout: "5|3|1|1\n", stderr: "" });
      });

      const info = await getDockerInfo();

      expect(info.version).toBe("24.0.7");
      expect(info.containers).toBe(5);
      expect(info.running).toBe(3);
      expect(info.paused).toBe(1);
      expect(info.stopped).toBe(1);
    });

    it("throws error when Docker is not running", async () => {
      mockExecError(new Error("Cannot connect to Docker daemon"));

      await expect(getDockerInfo()).rejects.toThrow("Failed to get Docker info");
    });
  });

  describe("listContainers", () => {
    it("returns empty array when no containers exist", async () => {
      mockExecSuccess("");

      const containers = await listContainers();

      expect(containers).toEqual([]);
    });

    it("parses container list correctly", async () => {
      const mockOutput = "abc123456789|my-container|nginx:latest|Up 2 hours|running|2024-01-13 10:00:00|80/tcp\n";
      
      // Mock ps command
      execMock.mockImplementationOnce((cmd: string, callback: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
        callback(null, { stdout: mockOutput, stderr: "" });
      });
      // Mock stats command (will be called for running container)
      execMock.mockImplementationOnce((cmd: string, callback: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
        callback(null, { stdout: "2.5%|128MiB / 1GiB\n", stderr: "" });
      });

      const containers = await listContainers();

      expect(containers).toHaveLength(1);
      expect(containers[0].id).toBe("abc123456789");
      expect(containers[0].name).toBe("my-container");
      expect(containers[0].image).toBe("nginx:latest");
      expect(containers[0].status).toBe("running");
    });

    it("throws error when Docker command fails", async () => {
      mockExecError(new Error("Docker not found"));

      await expect(listContainers()).rejects.toThrow("Failed to list containers");
    });
  });

  describe("getContainerStats", () => {
    it("returns stats for a container", async () => {
      mockExecSuccess("5.2%|256MiB / 2GiB\n");

      const stats = await getContainerStats("abc123");

      expect(stats.cpuPercent).toBe(5.2);
      expect(stats.memoryUsage).toBeGreaterThan(0);
      expect(stats.memoryLimit).toBeGreaterThan(0);
    });

    it("returns zero stats on error", async () => {
      mockExecError(new Error("Container not found"));

      const stats = await getContainerStats("invalid");

      expect(stats.cpuPercent).toBe(0);
      expect(stats.memoryUsage).toBe(0);
      expect(stats.memoryLimit).toBe(0);
    });
  });

  describe("getContainerLogs", () => {
    it("returns logs for a container", async () => {
      mockExecSuccess("2024-01-13T10:00:00Z Log line 1\n2024-01-13T10:00:01Z Log line 2\n");

      const result = await getContainerLogs("abc123", 100);

      expect(result.logs).toContain("Log line 1");
      expect(result.logs).toContain("Log line 2");
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it("returns error message when logs fetch fails", async () => {
      mockExecError(new Error("Container not found"));

      const result = await getContainerLogs("invalid");

      expect(result.logs).toContain("Error fetching logs");
    });
  });

  describe("Container actions", () => {
    describe("startContainer", () => {
      it("starts a container successfully", async () => {
        mockExecSuccess("abc123\n");

        const result = await startContainer("abc123");

        expect(result).toBe(true);
      });

      it("throws error when start fails", async () => {
        mockExecError(new Error("Container already running"));

        await expect(startContainer("abc123")).rejects.toThrow("Failed to start container");
      });
    });

    describe("stopContainer", () => {
      it("stops a container successfully", async () => {
        mockExecSuccess("abc123\n");

        const result = await stopContainer("abc123");

        expect(result).toBe(true);
      });

      it("throws error when stop fails", async () => {
        mockExecError(new Error("Container not running"));

        await expect(stopContainer("abc123")).rejects.toThrow("Failed to stop container");
      });
    });

    describe("restartContainer", () => {
      it("restarts a container successfully", async () => {
        mockExecSuccess("abc123\n");

        const result = await restartContainer("abc123");

        expect(result).toBe(true);
      });

      it("throws error when restart fails", async () => {
        mockExecError(new Error("Container not found"));

        await expect(restartContainer("abc123")).rejects.toThrow("Failed to restart container");
      });
    });
  });
});

// Additional tests for Image Management and Docker Compose features
describe("Image Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listImages", () => {
    it("should export listImages function", async () => {
      const docker = await import("./docker");
      expect(docker.listImages).toBeDefined();
      expect(typeof docker.listImages).toBe("function");
    });

    it("throws error when Docker is not available", async () => {
      execMock.mockImplementationOnce((cmd: string, callback: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
        callback(new Error("Docker not available"), { stdout: "", stderr: "" });
      });

      const { listImages } = await import("./docker");
      await expect(listImages()).rejects.toThrow("Failed to list images");
    });
  });

  describe("deleteImage", () => {
    it("should export deleteImage function", async () => {
      const docker = await import("./docker");
      expect(docker.deleteImage).toBeDefined();
      expect(typeof docker.deleteImage).toBe("function");
    });

    it("deletes an image successfully", async () => {
      execMock.mockImplementationOnce((cmd: string, callback: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
        callback(null, { stdout: "Deleted: sha256:abc123\n", stderr: "" });
      });

      const { deleteImage } = await import("./docker");
      const result = await deleteImage("sha256:abc123");

      expect(result).toBe(true);
    });

    it("throws error when delete fails", async () => {
      execMock.mockImplementationOnce((cmd: string, callback: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
        callback(new Error("Image in use"), { stdout: "", stderr: "Error: image is in use" });
      });

      const { deleteImage } = await import("./docker");
      await expect(deleteImage("sha256:abc123")).rejects.toThrow();
    });
  });

  describe("pruneImages", () => {
    it("should export pruneImages function", async () => {
      const docker = await import("./docker");
      expect(docker.pruneImages).toBeDefined();
      expect(typeof docker.pruneImages).toBe("function");
    });

    it("prunes unused images successfully", async () => {
      execMock.mockImplementationOnce((cmd: string, callback: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
        callback(null, { stdout: "Deleted Images:\nsha256:abc123\nTotal reclaimed space: 100MB\n", stderr: "" });
      });

      const { pruneImages } = await import("./docker");
      const result = await pruneImages();

      expect(result).toHaveProperty("deleted");
      expect(result).toHaveProperty("spaceReclaimed");
    });
  });
});

describe("Docker Compose", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listComposeProjects", () => {
    it("should export listComposeProjects function", async () => {
      const docker = await import("./docker");
      expect(docker.listComposeProjects).toBeDefined();
      expect(typeof docker.listComposeProjects).toBe("function");
    });

    it("returns empty array when no compose projects exist", async () => {
      execMock.mockImplementationOnce((cmd: string, callback: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
        callback(null, { stdout: "", stderr: "" });
      });

      const { listComposeProjects } = await import("./docker");
      const projects = await listComposeProjects();

      expect(projects).toEqual([]);
    });
  });

  describe("startComposeProject", () => {
    it("should export startComposeProject function", async () => {
      const docker = await import("./docker");
      expect(docker.startComposeProject).toBeDefined();
      expect(typeof docker.startComposeProject).toBe("function");
    });
  });

  describe("stopComposeProject", () => {
    it("should export stopComposeProject function", async () => {
      const docker = await import("./docker");
      expect(docker.stopComposeProject).toBeDefined();
      expect(typeof docker.stopComposeProject).toBe("function");
    });
  });

  describe("restartComposeProject", () => {
    it("should export restartComposeProject function", async () => {
      const docker = await import("./docker");
      expect(docker.restartComposeProject).toBeDefined();
      expect(typeof docker.restartComposeProject).toBe("function");
    });
  });
});

describe("formatBytes utility", () => {
  it("should format bytes correctly", async () => {
    const { formatBytes } = await import("./docker");
    
    expect(formatBytes(0)).toBe("0B");
    // formatBytes returns values with decimal for smaller numbers
    expect(formatBytes(1024)).toMatch(/1(\.0)?KB/);
    expect(formatBytes(1024 * 1024)).toMatch(/1(\.0)?MB/);
    expect(formatBytes(1024 * 1024 * 1024)).toMatch(/1(\.0)?GB/);
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toMatch(/1(\.0)?TB/);
  });
});
