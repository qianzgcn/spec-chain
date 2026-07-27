import SaveOutlined from "@ant-design/icons/SaveOutlined";
import { Button } from "antd";

export function ProjectSettingsSaveButton({
  dirty,
  pending,
  children,
}: {
  dirty: boolean;
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="primary"
      htmlType="submit"
      icon={<SaveOutlined />}
      loading={pending}
      disabled={!dirty}
    >
      {children}
    </Button>
  );
}
