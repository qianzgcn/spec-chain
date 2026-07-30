import type { AiExecutionStage } from "@/generated/prisma/enums";

export interface AiWorkflow<INPUT, OUTPUT> {
  run(input: INPUT): Promise<OUTPUT>;
}

export class AiWorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiWorkflowError";
  }
}

export type WorkflowLogEvent = {
  level: "INFO" | "WARN";
  stage: AiExecutionStage;
  message: string;
};
