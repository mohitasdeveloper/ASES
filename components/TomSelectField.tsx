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
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  allowEmptyOption?: boolean;
}

export default function TomSelectField({ options, value, onChange, placeholder, allowEmptyOption }: Props) {
  const selectRef = useRef<HTMLSelectElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tsRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!selectRef.current) return;
    const ts = new TomSelectLib(selectRef.current, {
      allowEmptyOption: !!allowEmptyOption,
      onChange: (val: string) => onChangeRef.current(val),
    });
    tsRef.current = ts;
    return () => {
      ts.destroy();
      tsRef.current = null;
    };
    // Rebuild whenever the option list changes (data reload)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  useEffect(() => {
    if (tsRef.current && tsRef.current.getValue() !== value) {
      tsRef.current.setValue(value, true);
    }
  }, [value]);

  return (
    <select ref={selectRef} defaultValue={value}>
      <option value="">{placeholder || 'Select...'}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
