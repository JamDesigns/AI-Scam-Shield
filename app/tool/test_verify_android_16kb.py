"""Binary fixtures exercise the release check independently of the current AAB."""
import struct
import unittest

from verify_android_16kb import inspect_elf


def elf64(alignment=0x4000, offset=0, relro_end=None, load_end=0x8000):
    count = 1 if relro_end is None else 2
    data = bytearray(64 + count * 56)
    data[:6] = b'\x7fELF\x02\x01'
    struct.pack_into('<Q', data, 32, 64)
    struct.pack_into('<HH', data, 54, 56, count)
    struct.pack_into('<IIQQQQQQ', data, 64, 1, 6, offset, 0x4000,
                     0x4000, load_end - 0x4000, load_end - 0x4000, alignment)
    if relro_end is not None:
        struct.pack_into('<IIQQQQQQ', data, 120, 0x6474E552, 4, 0, 0x4000,
                         0x4000, relro_end - 0x4000, relro_end - 0x4000, 1)
    return data


class AlignmentTest(unittest.TestCase):
    def test_rejects_four_kb_load(self):
        self.assertFalse(inspect_elf(elf64(alignment=0x1000))['passes_16kb'])

    def test_accepts_sixteen_and_sixty_four_kb(self):
        for alignment in (0x4000, 0x10000):
            with self.subTest(alignment=alignment):
                self.assertTrue(inspect_elf(elf64(alignment=alignment))['passes_16kb'])

    def test_rejects_load_address_offset_mismatch(self):
        self.assertFalse(inspect_elf(elf64(offset=0x1000))['passes_16kb'])

    def test_rejects_relro_sharing_page_with_writable_data(self):
        self.assertFalse(inspect_elf(elf64(relro_end=0x5000))['passes_16kb'])

    def test_accepts_relro_ending_on_page_boundary(self):
        self.assertTrue(inspect_elf(elf64(relro_end=0x4000))['passes_16kb'])

    def test_accepts_terminal_relro_without_following_writable_data(self):
        self.assertTrue(inspect_elf(elf64(relro_end=0x5000, load_end=0x5000))['passes_16kb'])

    def test_rejects_non_elf(self):
        with self.assertRaises(ValueError):
            inspect_elf(b'invalid')


if __name__ == '__main__':
    unittest.main()
