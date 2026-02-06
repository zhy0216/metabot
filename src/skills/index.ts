import { join } from "path";
import { readdir } from "fs/promises";
import type { Skill, SkillMetadata } from "../types";
import { getConfig } from "../config";

export class SkillsLoader {
  private skills: Map<string, Skill> = new Map();
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;

    const config = getConfig();
    const skillsDir = join(config.workspace, "skills");

    try {
      const entries = await readdir(skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          await this.loadSkill(join(skillsDir, entry.name));
        }
      }
    } catch {
      // Skills directory doesn't exist yet
    }

    this.loaded = true;
  }

  private async loadSkill(skillDir: string): Promise<void> {
    const skillFile = join(skillDir, "SKILL.md");
    const file = Bun.file(skillFile);

    if (!(await file.exists())) return;

    try {
      const content = await file.text();
      const { metadata, body } = this.parseSkillFile(content);
      const name = skillDir.split("/").pop()!;

      // Check requirements
      const { available, missing } = await this.checkRequirements(metadata);

      this.skills.set(name, {
        name,
        metadata: { ...metadata, name },
        content: body,
        available,
        missingRequirements: missing,
      });
    } catch {
      // Skip invalid skill files
    }
  }

  private parseSkillFile(content: string): { metadata: SkillMetadata; body: string } {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!frontmatterMatch) {
      return {
        metadata: { name: "", description: "" },
        body: content,
      };
    }

    const [, frontmatter = "", body = ""] = frontmatterMatch;

    // Simple YAML parsing for our needs
    const metadata: SkillMetadata = { name: "", description: "" };
    const lines = frontmatter.split("\n");

    for (const line of lines) {
      const [key, ...valueParts] = line.split(":");
      const value = valueParts.join(":").trim();

      if (key === "description") {
        metadata.description = value;
      } else if (key === "always") {
        metadata.always = value === "true";
      } else if (key === "requires") {
        // Handle nested requires (simplified)
        metadata.requires = {};
      }
    }

    return { metadata, body: body.trim() };
  }

  private async checkRequirements(
    metadata: SkillMetadata
  ): Promise<{ available: boolean; missing: string[] }> {
    const missing: string[] = [];

    if (metadata.requires?.bins) {
      for (const bin of metadata.requires.bins) {
        const result = Bun.spawnSync(["which", bin]);
        if (result.exitCode !== 0) {
          missing.push(`binary:${bin}`);
        }
      }
    }

    if (metadata.requires?.env) {
      for (const envVar of metadata.requires.env) {
        if (!process.env[envVar]) {
          missing.push(`env:${envVar}`);
        }
      }
    }

    return { available: missing.length === 0, missing };
  }

  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  getAvailable(): Skill[] {
    return this.getAll().filter((s) => s.available);
  }

  getAlwaysOn(): Skill[] {
    return this.getAvailable().filter((s) => s.metadata.always);
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  buildContext(): string {
    const alwaysOn = this.getAlwaysOn();
    const available = this.getAvailable().filter((s) => !s.metadata.always);
    const unavailable = this.getAll().filter((s) => !s.available);

    const sections: string[] = [];

    if (alwaysOn.length > 0) {
      sections.push("## Active Skills\n");
      for (const skill of alwaysOn) {
        sections.push(`### ${skill.name}\n${skill.content}\n`);
      }
    }

    if (available.length > 0) {
      sections.push("## Available Skills\n");
      sections.push("Use read_file to load these skills when needed:\n");
      for (const skill of available) {
        sections.push(`- **${skill.name}**: ${skill.metadata.description}`);
      }
      sections.push("");
    }

    if (unavailable.length > 0) {
      sections.push("## Unavailable Skills\n");
      sections.push("These skills have unmet requirements:\n");
      for (const skill of unavailable) {
        sections.push(
          `- **${skill.name}**: Missing ${skill.missingRequirements?.join(", ")}`
        );
      }
      sections.push("");
    }

    return sections.join("\n");
  }
}

export const skillsLoader = new SkillsLoader();
