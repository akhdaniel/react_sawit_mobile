import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { LoginForm } from '@/features/auth/LoginForm';
import { t } from '@/i18n/id';

describe('LoginForm', () => {
  it('menampilkan error validasi bila kosong', async () => {
    const onSubmit = jest.fn();
    await render(<LoginForm defaultBaseUrl="http://10.0.2.2:8080/xsm/v1" onSubmit={onSubmit} />);
    await fireEvent.press(screen.getByText(t('auth.submit')));
    expect(await screen.findByText(t('auth.loginRequired'))).toBeTruthy();
    expect(screen.getByText(t('auth.passwordRequired'))).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('mengirim nilai ter-trim dan URL tanpa garis miring akhir', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<LoginForm defaultBaseUrl="http://10.0.2.2:8080/xsm/v1" onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByLabelText(t('auth.login')), '  mandor.panen ');
    await fireEvent.changeText(screen.getByLabelText(t('auth.password')), 'rahasia');
    await fireEvent.press(screen.getByText(new RegExp(t('auth.serverToggle'))));
    await fireEvent.changeText(screen.getByLabelText(t('auth.serverUrl')), 'http://192.168.1.8:8080/xsm/v1/');
    await fireEvent.press(screen.getByText(t('auth.submit')));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual({
      login: 'mandor.panen',
      password: 'rahasia',
      baseUrl: 'http://192.168.1.8:8080/xsm/v1',
    });
  });

  it('URL server tidak valid ditolak', async () => {
    const onSubmit = jest.fn();
    await render(<LoginForm defaultBaseUrl="bukan-url" onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByLabelText(t('auth.login')), 'a');
    await fireEvent.changeText(screen.getByLabelText(t('auth.password')), 'b');
    await fireEvent.press(screen.getByText(t('auth.submit')));
    expect(await screen.findByText('URL server tidak valid')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('menampilkan pesan error dari server', async () => {
    await render(<LoginForm defaultBaseUrl="http://s/xsm/v1" onSubmit={jest.fn()} error="Login atau password salah" />);
    expect(screen.getByText('Login atau password salah')).toBeTruthy();
  });
});
