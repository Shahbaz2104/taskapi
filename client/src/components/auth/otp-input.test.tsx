import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OtpInput } from "@/components/auth/otp-input";

describe("OtpInput", () => {
  it("joins typed digits and reports completion", async () => {
    const onChange = vi.fn();
    const onComplete = vi.fn();
    const user = userEvent.setup();

    render(<OtpInput length={4} onChange={onChange} onComplete={onComplete} />);
    const boxes = screen.getAllByRole("textbox");

    await user.type(boxes[0]!, "1");
    expect(onChange).toHaveBeenLastCalledWith("1");
    expect(boxes[1]).toHaveFocus();

    await user.type(boxes[1]!, "2");
    await user.type(boxes[2]!, "3");
    await user.type(boxes[3]!, "4");

    expect(onChange).toHaveBeenLastCalledWith("1234");
    expect(onComplete).toHaveBeenCalledWith("1234");
    // fires once per completion, not on every keystroke
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("distributes a full paste across all boxes", () => {
    const onChange = vi.fn();
    render(<OtpInput length={6} onChange={onChange} />);
    const boxes = screen.getAllByRole("textbox");

    const event = new Event("paste", {
      bubbles: true,
      cancelable: true,
    }) as Event & { clipboardData: { getData: (t: string) => string } };
    event.clipboardData = { getData: () => "654321" };
    fireEvent(boxes[0]!, event);

    for (const [i, box] of boxes.entries()) {
      expect(box).toHaveValue(String("654321"[i]));
    }
    expect(onChange).toHaveBeenLastCalledWith("654321");
  });

  it("backspace on an empty box clears the previous one", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<OtpInput length={3} onChange={onChange} />);
    const boxes = screen.getAllByRole("textbox");

    await user.type(boxes[0]!, "7"); // → box[1] focused
    await user.keyboard("{Backspace}");

    expect(boxes[0]).toHaveValue("");
    expect(boxes[0]).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("");
  });
});
