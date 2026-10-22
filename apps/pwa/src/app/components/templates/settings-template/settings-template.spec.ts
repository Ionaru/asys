// SPDX-License-Identifier: EUPL-1.2
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SettingsTemplate } from './settings-template';

const options = (...values: readonly string[]) => values.map((value) => ({ value, label: value }));

const setup = async (loaded = true) => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(SettingsTemplate);
  const inputs = {
    statusLine: '',
    loaded,
    failed: true,
    busy: false,
    awaitingSync: false,
    urgencyOptions: options('1', '2', '3'),
    urgency: '2',
    zoneOptions: options('UTC', 'Europe/Amsterdam'),
    zone: 'UTC',
    currentZone: 'UTC',
    deviceZone: 'Europe/Amsterdam',
  };
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  const host = fixture.nativeElement as HTMLElement;
  const select = (label: string): HTMLSelectElement => {
    const field = [...host.querySelectorAll('asys-select-field')].find((candidate) =>
      candidate.textContent?.includes(label),
    );
    const found = field?.querySelector('select');
    if (found === null || found === undefined) throw new Error(`Missing select ${label}`);
    return found;
  };
  return { fixture, host, select };
};

describe('SettingsTemplate', () => {
  it('reports a chosen Urgency window and time zone through their models', async () => {
    const { fixture, select } = await setup();
    const urgencyChange = vi.fn<(value: string) => void>();
    const zoneChange = vi.fn<(value: string) => void>();
    fixture.componentInstance.urgency.subscribe(urgencyChange);
    fixture.componentInstance.zone.subscribe(zoneChange);

    select('Urgency window').value = '3';
    select('Urgency window').dispatchEvent(new Event('change', { bubbles: true }));
    select('Time zone').value = 'Europe/Amsterdam';
    select('Time zone').dispatchEvent(new Event('change', { bubbles: true }));

    expect(urgencyChange).toHaveBeenCalledExactlyOnceWith('3');
    expect(zoneChange).toHaveBeenCalledExactlyOnceWith('Europe/Amsterdam');
  });

  it('reports the device time zone button as useDeviceZone', async () => {
    const { fixture, host } = await setup();
    const useDeviceZone = vi.fn<(zone: string) => void>();
    fixture.componentInstance.useDeviceZone.subscribe(useDeviceZone);

    const button = [...host.querySelectorAll('button')].find((candidate) =>
      candidate.textContent?.includes("Use this device's time zone"),
    );
    button?.click();

    expect(useDeviceZone).toHaveBeenCalledExactlyOnceWith('Europe/Amsterdam');
  });

  it('shows the load state until loaded and emits retry from it', async () => {
    const { fixture, host } = await setup(false);
    const retry = vi.fn<() => void>();
    fixture.componentInstance.retry.subscribe(retry);

    expect(host.querySelector('asys-select-field')).toBeNull();
    host.querySelector<HTMLButtonElement>('asys-load-state button')?.click();

    expect(retry).toHaveBeenCalledOnce();
    expect(host.querySelector('.settings__links')).not.toBeNull();
  });
});
