/*
MathJax = {
    tex: {
      inlineMath: [['$', '$'], ['\\(', '\\)']],
      processEscapes: true,
      tags: 'ams',
      macros: {
        ssqrt: ['\\sqrt{\\smash[b]{\\mathstrut #1}}', 1],
        tcdegree: ['\\unicode{xb0}'],
        tccelsius: ['\\unicode{x2103}'],
        tcperthousand: ['\\unicode{x2030}'],
        tcmu: ['\\unicode{x3bc}'],
        tcohm: ['\\unicode{x3a9}']
      }
    },
    chtml: {
      matchFontHeight: true,
      displayAlign: "left",
      displayIndent: "2em"
    }
  };
*/


MathJax = {
    loader: {
        load: ['[tex]/mhchem']  // mhchem extensionをロード
    },
    tex: {
        packages: {'[+]': ['mhchem']},  // mhchem packageを追加
        inlineMath: [['$', '$'], ['\\(', '\\)']],
        processEscapes: true,
        tags: 'ams',
        macros: {
            ssqrt: ['\\sqrt{\\smash[b]{\\mathstrut #1}}', 1],
            tcdegree: ['\\unicode{xb0}'],
            tccelsius: ['\\unicode{x2103}'],
            tcperthousand: ['\\unicode{x2030}'],
            tcmu: ['\\unicode{x3bc}'],
            tcohm: ['\\unicode{x3a9}']
        }
    },
    chtml: {
        matchFontHeight: true,
        displayAlign: "left",
        displayIndent: "2em"
    }
};




