import Link from "next/link";
import React from "react";
import Image from "next/image";

const Footer = () => {
  return (
    <footer className="bg-white dark:bg-zinc-900 py-2 border-t border-zinc-100 dark:border-zinc-800">
      <div className="mx-4 sm:mx-16">
        {/* Phones: one short line */}
        <p className="sm:hidden text-center text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
          Created by <span className="font-semibold text-zinc-700 dark:text-zinc-200">Jodel Aristilde</span> ·{" "}
          <a href="tel:+14178930047" className="font-semibold text-zinc-700 dark:text-zinc-200">417-893-0047</a>
        </p>

        {/* Desktop Layout - Unchanged */}
        <div className="hidden sm:flex flex-row items-center justify-between gap-6">

          <div className="flex items-center text-left">
            <Link
              href="/"
              className="flex justify-center items-center space-x-2"
            >
              <Image
                src="/logo.svg"
                unoptimized
                alt="Seating4U Logo"
                width={130}
                height={100}
              />
            </Link>
          </div>

          <div className="flex flex-col items-end">
            <div className="flex flex-row items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <span>© 2025</span>
              <p className="font-semibold text-black dark:text-white hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors duration-200 text-right">
                Created by Jodel Aristilde (2BrothersMovement)
              </p>
            </div>

            <div className="flex flex-row gap-[50px] font-light text-sm">
              <p>seating4you@gmail.com</p>
              <p>(417) 893-0047</p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
