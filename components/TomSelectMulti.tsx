'use client';

import { useEffect, useRef } from 'react';
import TomSelectLib from 'tom-select';
import 'tom-select/dist/css/tom-select.css';

interface Option {
  value: string;
  label: string;
}

interface Props {
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}

export default function TomSelectMulti({ options, value, onChange, placeholder }: Props) {
  const selectRef = useRef<HTMLSelectElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tsRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!selectRef.current) return;
    const ts = new TomSelectLib(selectRef.current, {
      plugins: ['remove_button'],
      maxItems: null,
      placeholder,
      onChange: (val: string[]) => onChangeRef.current(val),
    });
    tsRef.current = ts;
    return () => {
      ts.destroy();
      tsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  useEffect(() => {
    if (tsRef.current) {
      const current = tsRef.current.getValue();
      const sameLength = Array.isArray(current) && current.length === value.length;
      const sameSet = sameLength && value.every((v) => current.includes(v));
      if (!sameSet) tsRef.current.setValue(value, true);
    }
  }, [value]);

  return (
    <select ref={selectRef} multiple defaultValue={value}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
